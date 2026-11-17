"""All SQL the worker runs. Tables are created by the web app's migrations."""

from __future__ import annotations

from dataclasses import dataclass

import psycopg
from psycopg.types.json import Jsonb

from .asr import Transcript
from .flags import Correction, FlagDraft, segment_text


@dataclass(frozen=True)
class Job:
    id: str
    recording_id: str
    attempts: int


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
            RETURNING id::text, recording_id::text, attempts
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
            RETURNING recording_id
            """,
            (minutes, max_attempts),
        ).fetchall()
        for (recording_id,) in failed:
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
                    job.recording_id, segment_ids[f.segment_index], f.kind, f.severity,
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

