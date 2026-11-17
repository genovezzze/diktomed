"""Compares recognisers on the hospital's own test clips.

    python -m training.evaluate --manifest /data/training/test.jsonl \\
        --models /models/whisper-lv-ct2,/models/whisper-lv-hospital-ct2

For every model: word error rate, character error rate and term recall (how
often a vocabulary term present in the approved text was recognised). This is
the number that decides whether a fine-tuned model replaces the current one.
"""

from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

from diktomed_worker.metrics import cer, wer, words


def load_manifest(path: Path, limit: int | None) -> list[dict]:
    items = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    return items[:limit] if limit else items


def term_hits(reference: str, hypothesis: str, terms: list[str]) -> tuple[int, int]:
    ref = " ".join(words(reference))
    hyp = " ".join(words(hypothesis))
    present = [t for t in terms if t in ref]
    return sum(1 for t in present if t in hyp), len(present)


def load_terms_from_db() -> list[str]:
    url = os.environ.get("DATABASE_URL")
    if not url:
        return []
    import psycopg  # noqa: PLC0415

    from diktomed_worker.config import libpq_url  # noqa: PLC0415

    with psycopg.connect(libpq_url(url)) as conn:
        rows = conn.execute("SELECT text FROM terms UNION SELECT \"right\" FROM term_corrections WHERE count >= 2").fetchall()
    return sorted({" ".join(words(r[0])) for r in rows if r[0]})


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--models", required=True, help="comma-separated CTranslate2 model folders")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--compute-type", default="auto")
    parser.add_argument("--language", default="lv")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--out", type=Path, help="write results as JSON here")
    args = parser.parse_args()

    from diktomed_worker.asr import FasterWhisperTranscriber  # noqa: PLC0415

    items = load_manifest(args.manifest, args.limit)
    base = args.manifest.parent
    terms = load_terms_from_db()
    results = []

    for model in [m.strip() for m in args.models.split(",") if m.strip()]:
        t = FasterWhisperTranscriber(model, args.device, args.compute_type, args.language, beam_size=5)
        w_err = w_ref = c_err = c_ref = hits = present = 0
        started = time.monotonic()
        audio_sec = 0.0
        for item in items:
            transcript = t.transcribe(base / item["audio"], None)
            hyp = " ".join(s.text.strip() for s in transcript.segments)
            e, n = wer(item["text"], hyp)
            w_err, w_ref = w_err + e, w_ref + n
            e, n = cer(item["text"], hyp)
            c_err, c_ref = c_err + e, c_ref + n
            h, p = term_hits(item["text"], hyp, terms)
            hits, present = hits + h, present + p
            audio_sec += item.get("duration", 0)
        elapsed = time.monotonic() - started
        row = {
            "model": t.name,
            "clips": len(items),
            "wer": round(w_err / w_ref, 4) if w_ref else None,
            "cer": round(c_err / c_ref, 4) if c_ref else None,
            "term_recall": round(hits / present, 4) if present else None,
            "realtime_factor": round(elapsed / audio_sec, 3) if audio_sec else None,
        }
        results.append(row)
        print(json.dumps(row, ensure_ascii=False))

    if args.out:
        args.out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
