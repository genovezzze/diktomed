"""All SQL the worker runs. Tables are created by the web app's migrations."""

from __future__ import annotations

from dataclasses import dataclass

import psycopg
from psycopg.types.json import Jsonb

from .asr import Transcript
from .flags import Correction, FlagDraft, segment_text
from .protocol import FieldDraft, Section

TRANSCRIBE, PROTOCOL = "TRANSCRIBE", "PROTOCOL"


@dataclass(frozen=True)
class Job:
    id: str
    recording_id: str
    attempts: int
    kind: str = TRANSCRIBE


@dataclass(frozen=True)
class RecordingRow:
    id: str
    storage_key: str
    original_name: str
    planned_side: str | None


def connect(url: str) -> psycopg.Connection:
    return psycopg.connect(url, autocommit=False)


def claim_job(conn: psycopg.Connection) -> Job | None:
    """Takes the oldest queued job. SKIP LOCKED lets several workers share a queue."""
    with conn.transaction():
        row = conn.execute(
            """
            UPDATE jobs SET status = 'RUNNING', locked_at = now(), attempts = attempts + 1
            WHERE id = (
                SELECT id FROM jobs WHERE status = 'QUEUED'
                ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
            )
            RETURNING id::text, recording_id::text, attempts, kind
            """
        ).fetchone()
    return Job(*row) if row else None


def requeue_stale(conn: psycopg.Connection, minutes: int, max_attempts: int) -> int:
    """Jobs left RUNNING by a crashed worker go back to the queue (or fail)."""
    with conn.transaction():
        failed = conn.execute(
            """
            UPDATE jobs SET status = 'FAILED', error = 'Darbs pārtrūka vairākas reizes.', finished_at = now()
            WHERE status = 'RUNNING' AND locked_at < now() - make_interval(mins => %s) AND attempts >= %s
            RETURNING recording_id, kind
            """,
            (minutes, max_attempts),
        ).fetchall()
        for recording_id, kind in failed:
            if kind == PROTOCOL:
                conn.execute(
                    "UPDATE protocols SET status = 'FAILED', error_message = 'Sagatavošana vairākas reizes pārtrūka.', updated_at = now() WHERE recording_id = %s",
                    (recording_id,),
                )
            else:
                conn.execute(
                    "UPDATE recordings SET status = 'FAILED', error_message = 'Apstrāde vairākas reizes pārtrūka.', updated_at = now() WHERE id = %s",
                    (recording_id,),
                )
        requeued = conn.execute(
            """
            UPDATE jobs SET status = 'QUEUED', locked_at = NULL
            WHERE status = 'RUNNING' AND locked_at < now() - make_interval(mins => %s) AND attempts < %s
            """,
            (minutes, max_attempts),
        ).rowcount
    return requeued + len(failed)


def load_recording(conn: psycopg.Connection, recording_id: str) -> RecordingRow | None:
    row = conn.execute(
        "SELECT id::text, storage_key, original_name, planned_side::text FROM recordings WHERE id = %s", (recording_id,)
    ).fetchone()
    conn.commit()
    return RecordingRow(*row) if row else None


def set_processing(conn: psycopg.Connection, recording_id: str) -> None:
    with conn.transaction():
        conn.execute(
            """UPDATE recordings SET status = 'PROCESSING', processing_started_at = now(), progress = 0,
               error_message = NULL, updated_at = now() WHERE id = %s""",
            (recording_id,),
        )


def update_progress(conn: psycopg.Connection, recording_id: str, value: float) -> None:
    with conn.transaction():
        conn.execute("UPDATE recordings SET progress = %s WHERE id = %s", (round(value, 3), recording_id))


def load_terms(conn: psycopg.Connection) -> list[str]:
    rows = conn.execute("SELECT text FROM terms ORDER BY created_at").fetchall()
    conn.commit()
    return [r[0] for r in rows]


def load_corrections(conn: psycopg.Connection, min_count: int) -> list[Correction]:
    rows = conn.execute(
        "SELECT wrong, \"right\", count FROM term_corrections WHERE enabled AND count >= %s ORDER BY count DESC LIMIT 500",
        (min_count,),
    ).fetchall()
    conn.commit()
    return [Correction(*r) for r in rows]


def save_transcript(
    conn: psycopg.Connection,
    job: Job,
    transcript: Transcript,
    flags: list[FlagDraft],
    processing_seconds: float,
) -> None:
    """Replaces the recording's segments and flags in one transaction."""
    with conn.transaction():
        conn.execute("DELETE FROM segments WHERE recording_id = %s", (job.recording_id,))
        conn.execute("DELETE FROM flags WHERE recording_id = %s", (job.recording_id,))
        segment_ids: list[str] = []
        for idx, seg in enumerate(transcript.segments):
            text = segment_text(seg)
            words = [{"w": w.text, "s": round(w.start, 2), "e": round(w.end, 2), "p": round(w.prob, 3)} for w in seg.words]
            row = conn.execute(
                """
                INSERT INTO segments (recording_id, idx, start, "end", text, original_text, confidence,
                                      avg_logprob, no_speech_prob, compression_ratio, words)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id::text
                """,
                (
                    job.recording_id, idx, seg.start, seg.end, text, text, round(seg.confidence, 4),
                    seg.avg_logprob, seg.no_speech_prob, seg.compression_ratio, Jsonb(words),
                ),
            ).fetchone()
            segment_ids.append(row[0])

        for f in flags:
            conn.execute(
                """
                INSERT INTO flags (recording_id, segment_id, kind, severity, start, "end", message, excerpt, suggestion)
                VALUES (%s, %s, %s::flag_kind, %s::flag_severity, %s, %s, %s, %s, %s)
                """,
                (
                    job.recording_id, None if f.segment_index is None else segment_ids[f.segment_index], f.kind, f.severity,
                    f.start, f.end, f.message, f.excerpt, f.suggestion,
                ),
            )

        conn.execute(
            """
            UPDATE recordings SET status = 'READY', duration_sec = %s, language = %s, language_prob = %s,
                   model_name = %s, processed_at = now(), updated_at = now(), error_message = NULL, progress = 1
            WHERE id = %s
            """,
            (transcript.duration, transcript.language, transcript.language_prob, transcript.model_name, job.recording_id),
        )
        conn.execute("UPDATE jobs SET status = 'DONE', finished_at = now(), error = NULL WHERE id = %s", (job.id,))
        conn.execute(
            "INSERT INTO audit_logs (recording_id, action, details) VALUES (%s, 'RECORDING_PROCESSED', %s)",
            (
                job.recording_id,
                Jsonb({"segments": len(transcript.segments), "flags": len(flags), "seconds": round(processing_seconds, 1)}),
            ),
        )


def mark_failed(conn: psycopg.Connection, job: Job, message: str, final: bool) -> None:
    """A retryable failure puts the job back in the queue; a final one is shown to the user."""
    conn.rollback()
    if job.kind == PROTOCOL:
        with conn.transaction():
            conn.execute(
                "UPDATE jobs SET status = %s::job_status, error = %s, locked_at = NULL, finished_at = CASE WHEN %s THEN now() END WHERE id = %s",
                ("FAILED" if final else "QUEUED", message, final, job.id),
            )
            conn.execute(
                "UPDATE protocols SET status = %s::protocol_status, error_message = %s, updated_at = now() WHERE recording_id = %s",
                ("FAILED" if final else "QUEUED", message if final else None, job.recording_id),
            )
        return
    with conn.transaction():
        if final:
            conn.execute("UPDATE jobs SET status = 'FAILED', error = %s, finished_at = now() WHERE id = %s", (message, job.id))
            conn.execute(
                "UPDATE recordings SET status = 'FAILED', error_message = %s, updated_at = now() WHERE id = %s",
                (message, job.recording_id),
            )
            conn.execute(
                "INSERT INTO audit_logs (recording_id, action, details) VALUES (%s, 'RECORDING_FAILED', %s)",
                (job.recording_id, Jsonb({"attempts": job.attempts})),
            )
        else:
            conn.execute("UPDATE jobs SET status = 'QUEUED', locked_at = NULL, error = %s WHERE id = %s", (message, job.id))
            conn.execute("UPDATE recordings SET status = 'QUEUED', updated_at = now() WHERE id = %s", (job.recording_id,))


def recordings_past_retention(conn: psycopg.Connection, days: int) -> list[tuple[str, str]]:
    rows = conn.execute(
        """
        SELECT id::text, storage_key FROM recordings
        WHERE status = 'APPROVED' AND audio_deleted_at IS NULL AND approved_at < now() - make_interval(days => %s)
        LIMIT 200
        """,
        (days,),
    ).fetchall()
    conn.commit()
    return [(r[0], r[1]) for r in rows]


def mark_audio_deleted(conn: psycopg.Connection, recording_id: str) -> None:
    with conn.transaction():
        conn.execute("UPDATE recordings SET audio_deleted_at = now(), updated_at = now() WHERE id = %s", (recording_id,))
        conn.execute(
            "INSERT INTO audit_logs (recording_id, action, details) VALUES (%s, 'AUDIO_DELETED', %s)",
            (recording_id, Jsonb({"reason": "retention"})),
        )



# --- protocol ----------------------------------------------------------------


def load_protocol_input(conn: psycopg.Connection, recording_id: str) -> tuple[str, str | None] | None:
    """(approved document text, planned side), or None if not approved."""
    row = conn.execute(
        """
        SELECT d.text, r.planned_side::text FROM documents d JOIN recordings r ON r.id = d.recording_id
        WHERE d.recording_id = %s AND r.status = 'APPROVED'
        """,
        (recording_id,),
    ).fetchone()
    conn.commit()
    return (row[0], row[1]) if row else None


def load_sections(conn: psycopg.Connection) -> list[Section]:
    rows = conn.execute(
        "SELECT key, title, hint, position, multi FROM protocol_sections WHERE active ORDER BY position"
    ).fetchall()
    conn.commit()
    return [Section(*r) for r in rows]


def set_protocol_processing(conn: psycopg.Connection, recording_id: str) -> None:
    with conn.transaction():
        conn.execute(
            "UPDATE protocols SET status = 'PROCESSING', error_message = NULL, updated_at = now() WHERE recording_id = %s",
            (recording_id,),
        )


def save_protocol(conn: psycopg.Connection, job: Job, sections: list[Section], fields: list[FieldDraft], engine: str) -> None:
    """Replaces the protocol's fields; every field starts as a suggestion."""
    titles = {s.key: (s.title, s.position) for s in sections}
    with conn.transaction():
        row = conn.execute(
            """UPDATE protocols SET status = 'READY', engine = %s, error_message = NULL, approved_by_id = NULL,
               approved_at = NULL, updated_at = now() WHERE recording_id = %s RETURNING id::text""",
            (engine, job.recording_id),
        ).fetchone()
        if row is None:
            row = conn.execute(
                "INSERT INTO protocols (recording_id, status, engine) VALUES (%s, 'READY', %s) RETURNING id::text",
                (job.recording_id, engine),
            ).fetchone()
        protocol_id = row[0]
        conn.execute("DELETE FROM protocol_fields WHERE protocol_id = %s", (protocol_id,))
        for f in fields:
            title, position = titles.get(f.key, (f.key, 999))
            conn.execute(
                """
                INSERT INTO protocol_fields (protocol_id, section_key, title, position, value, quotes, "check", check_message, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s::field_check, %s, 'SUGGESTED')
                """,
                (protocol_id, f.key, title, position, f.value, Jsonb(f.quotes), f.check, f.check_message),
            )
        conn.execute("UPDATE jobs SET status = 'DONE', finished_at = now(), error = NULL WHERE id = %s", (job.id,))
        warnings = sum(1 for f in fields if f.check not in ("OK", "EMPTY"))
        conn.execute(
            "INSERT INTO audit_logs (recording_id, action, details) VALUES (%s, 'PROTOCOL_DRAFTED', %s)",
            (job.recording_id, Jsonb({"fields": len(fields), "warnings": warnings, "engine": engine})),
        )
