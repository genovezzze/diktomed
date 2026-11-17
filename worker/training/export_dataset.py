"""Exports approved dictations as a training set: short audio clips + the
text a person approved for each of them.

    python -m training.export_dataset --out /data/training

The result is patient data. It stays on the hospital server, next to the
audio it came from, and should be deleted once a model has been trained.

Output:
    clips/<recording>_<idx>.wav   16 kHz mono clips, one per segment
    train.jsonl / test.jsonl      {"audio", "text", "duration", "recording_id"}

The split is by recording, never by segment, so a test set never contains a
second fragment of a dictation the model was trained on.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import wave
from pathlib import Path

import psycopg

from diktomed_worker.config import libpq_url

PAD_SECONDS = 0.15


def is_test(recording_id: str, ratio: float) -> bool:
    bucket = int(hashlib.sha1(recording_id.encode()).hexdigest()[:8], 16) % 1000
    return bucket < ratio * 1000


def cut_clip(src: Path, dst: Path, start: float, end: float, pad: float = PAD_SECONDS) -> float:
    """Writes [start - pad, end + pad] of a PCM WAV to dst; returns its length."""
    with wave.open(str(src), "rb") as w:
        rate = w.getframerate()
        total = w.getnframes()
        first = max(0, int((start - pad) * rate))
        last = min(total, int((end + pad) * rate))
        w.setpos(first)
        frames = w.readframes(last - first)
        params = w.getparams()
    dst.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(dst), "wb") as out:
        out.setparams(params)
        out.writeframes(frames)
    return (last - first) / rate


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--storage-dir", type=Path, default=Path(os.environ.get("STORAGE_DIR", "./data")))
    parser.add_argument("--test-ratio", type=float, default=0.1)
    parser.add_argument("--min-sec", type=float, default=1.0)
    parser.add_argument("--max-sec", type=float, default=29.0, help="Whisper reads at most 30 s at a time")
    args = parser.parse_args()

    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is not set")

    rows = []
    with psycopg.connect(libpq_url(url)) as conn:
        rows = conn.execute(
            """
            SELECT r.id::text, r.storage_key, s.idx, s.start, s."end", s.text
            FROM segments s JOIN recordings r ON r.id = s.recording_id
            WHERE r.status = 'APPROVED' AND r.audio_deleted_at IS NULL AND length(trim(s.text)) > 0
            ORDER BY r.approved_at, s.idx
            """
        ).fetchall()

    train, test = [], []
    skipped = 0
    for recording_id, storage_key, idx, start, end, text in rows:
        if not (args.min_sec <= end - start <= args.max_sec):
            skipped += 1
            continue
        src = (args.storage_dir / storage_key / "normalized.wav").resolve()
        if not src.exists():
            skipped += 1
            continue
        rel = Path("clips") / f"{recording_id}_{idx:04d}.wav"
        duration = cut_clip(src, args.out / rel, start, end)
        item = {"audio": str(rel), "text": " ".join(text.split()), "duration": round(duration, 2), "recording_id": recording_id}
        (test if is_test(recording_id, args.test_ratio) else train).append(item)

    args.out.mkdir(parents=True, exist_ok=True)
    for name, items in (("train.jsonl", train), ("test.jsonl", test)):
        with open(args.out / name, "w", encoding="utf-8") as f:
            for item in items:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")

    hours = sum(i["duration"] for i in train + test) / 3600
    print(f"train: {len(train)} clips, test: {len(test)} clips, {hours:.2f} h audio, skipped {skipped}")
    print(f"written to {args.out}. This is patient data: keep it on this server and delete it after training.")


if __name__ == "__main__":
    main()
