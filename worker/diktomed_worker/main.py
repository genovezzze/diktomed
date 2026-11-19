"""The worker loop: take a job, prepare audio, recognise, flag, save.

Logs carry ids and counts only. Dictation text is patient data and is never
written to logs.
"""

from __future__ import annotations

import argparse
import logging
import shutil
import signal
import time
from pathlib import Path

import psycopg

from . import db
from .asr import Transcriber, make_transcriber
from .audio import AudioError, normalize
from .config import Settings, load_settings
from .flags import build_flags, segment_text
from .llm import suggest
from .protocol import draft_protocol
from .vocab import build_initial_prompt

log = logging.getLogger("diktomed.worker")

NORMALIZED = "normalized.wav"
RETENTION_EVERY_SECONDS = 600
STALE_JOB_MINUTES = 120  # a long dictation on CPU can take a while


def recording_dir(settings: Settings, storage_key: str) -> Path:
    root = settings.storage_dir
    path = (root / storage_key).resolve()
    if root not in path.parents:
        raise ValueError("storage key escapes the storage root")
    return path


def find_original(directory: Path) -> Path:
    candidates = sorted(p for p in directory.glob("original.*") if p.is_file())
    if not candidates:
        raise AudioError("Augšupielādētais fails nav atrasts serverī.")
    return candidates[0]


def process_job(conn: psycopg.Connection, settings: Settings, transcriber: Transcriber, job: db.Job) -> None:
    started = time.monotonic()
    recording = db.load_recording(conn, job.recording_id)
    if recording is None:
        log.warning("job %s: recording is gone", job.id)
        db.mark_failed(conn, job, "Diktāts nav atrasts.", final=True)
        return

    db.set_processing(conn, recording.id)
    directory = recording_dir(settings, recording.storage_key)
    normalized = directory / NORMALIZED
    normalize(find_original(directory), normalized, enhance=settings.audio_enhance)

    corrections = db.load_corrections(conn, settings.correction_min_count)
    prompt = build_initial_prompt(db.load_terms(conn), [c.right for c in corrections[:30]])

    transcript = transcriber.transcribe(normalized, prompt, lambda p: db.update_progress(conn, recording.id, p))
    transcript.segments = [s for s in transcript.segments if segment_text(s)]

    flags = build_flags(
        transcript.segments,
        settings.line_threshold,
        settings.word_threshold,
        corrections,
        recording.planned_side,
        speech=transcript.speech,
    )
    if settings.llm_base_url and settings.llm_model and transcript.segments:
        flags += suggest(transcript.segments, settings.llm_base_url, settings.llm_model, settings.llm_timeout)
        flags.sort(key=lambda f: (f.start, f.end))

    elapsed = time.monotonic() - started
    db.save_transcript(conn, job, transcript, flags, elapsed)
    log.info(
        "job %s: recording %s ready, %d segments, %d flags, %.1fs audio in %.1fs",
        job.id, recording.id, len(transcript.segments), len(flags), transcript.duration, elapsed,
    )


def process_protocol_job(conn: psycopg.Connection, settings: Settings, job: db.Job) -> None:
    """Drafts the structured protocol from the approved transcript."""
    started = time.monotonic()
    source = db.load_protocol_input(conn, job.recording_id)
    if source is None:
        db.mark_failed(conn, job, "Transkripts vēl nav apstiprināts.", final=True)
        return
    text, planned_side = source
    sections = db.load_sections(conn)
    if not sections:
        db.mark_failed(conn, job, "Protokola sadaļas nav iestatītas.", final=True)
        return

    db.set_protocol_processing(conn, job.recording_id)
    llm = (settings.llm_base_url, settings.llm_model, settings.llm_timeout) if settings.llm_base_url and settings.llm_model else None
    fields, engine = draft_protocol(sections, text, planned_side, settings.protocol_backend, llm)
    db.save_protocol(conn, job, sections, fields, engine)
    warnings = sum(1 for f in fields if f.check not in ("OK", "EMPTY"))
    log.info(
        "job %s: protocol for recording %s ready, %d fields, %d warnings, engine %s, %.1fs",
        job.id, job.recording_id, len(fields), warnings, engine, time.monotonic() - started,
    )


def apply_retention(conn: psycopg.Connection, settings: Settings) -> None:
    """Deletes audio of approved recordings older than RETENTION_DAYS.
    The approved text stays; only the sound files go."""
    if settings.retention_days <= 0:
        return
    for recording_id, storage_key in db.recordings_past_retention(conn, settings.retention_days):
        directory = recording_dir(settings, storage_key)
        for name in [NORMALIZED, *[p.name for p in directory.glob("original.*")]]:
            (directory / name).unlink(missing_ok=True)
        if directory.exists() and not any(directory.iterdir()):
            shutil.rmtree(directory, ignore_errors=True)
        db.mark_audio_deleted(conn, recording_id)
        log.info("retention: audio of recording %s deleted", recording_id)


def run(settings: Settings, once: bool = False) -> None:
    transcriber = make_transcriber(settings)
    stopping = False

    def stop(*_: object) -> None:
        nonlocal stopping
        stopping = True
        log.info("stopping after the current job")

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    conn = db.connect(settings.database_url)
    last_maintenance = 0.0
    log.info("worker ready (backend=%s, model=%s)", settings.asr_backend, transcriber.name)

    while not stopping:
        try:
            if time.monotonic() - last_maintenance > RETENTION_EVERY_SECONDS:
                n = db.requeue_stale(conn, STALE_JOB_MINUTES, settings.max_attempts)
                if n:
                    log.warning("requeued or failed %d stale jobs", n)
                apply_retention(conn, settings)
                last_maintenance = time.monotonic()

            job = db.claim_job(conn)
            if job is None:
                if once:
                    break
                time.sleep(settings.poll_seconds)
                continue

            try:
                if job.kind == db.PROTOCOL:
                    process_protocol_job(conn, settings, job)
                else:
                    process_job(conn, settings, transcriber, job)
            except AudioError as exc:
                log.warning("job %s: audio error", job.id)
                db.mark_failed(conn, job, str(exc), final=True)
            except Exception:  # noqa: BLE001 - one bad file must not stop the queue
                log.exception("job %s failed (attempt %d)", job.id, job.attempts)
                final = job.attempts >= settings.max_attempts
                what = "Protokola sagatavošana" if job.kind == db.PROTOCOL else "Atpazīšana"
                db.mark_failed(conn, job, f"{what} neizdevās. Sazinieties ar administratoru.", final=final)
        except psycopg.OperationalError:
            log.exception("database connection lost, reconnecting in 5s")
            time.sleep(5)
            try:
                conn.close()
            except Exception:  # noqa: BLE001
                pass
            conn = db.connect(settings.database_url)

    conn.close()


def cli() -> None:
    parser = argparse.ArgumentParser(description="DiktoMed worker")
    parser.add_argument("--once", action="store_true", help="process the queue once and exit")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    run(load_settings(), once=args.once)
