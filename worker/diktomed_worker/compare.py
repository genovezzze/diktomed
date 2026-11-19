"""Compare audio clean-up presets on real recordings, before switching one on.

    python -m diktomed_worker.compare /in/Operacija_1.m4a [/in/Operacija_2.m4a ...] --out /in/rezultati

For every file and every preset (AUDIO_ENHANCE: off, denoise, voice) it
prepares the audio the way the worker would, transcribes it with the
configured model and prints how sure the model was. The prepared WAV files
and the texts are saved to --out, so a person can listen and read: a higher
score helps, but the text decides.

Runs inside the worker container, entirely offline; nothing is stored in the
database. Prints no transcript text to the log, only to the --out folder.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path

from .asr import Transcript, make_transcriber
from .audio import ENHANCE_PRESETS, normalize, wav_duration
from .flags import _covered

LOW_PROB = 0.5


@dataclass
class Score:
    words: int
    mean_prob: float
    low_share: float  # share of words the model was unsure about
    coverage: float  # share of the sound that has text under it

    def line(self) -> str:
        return (
            f"vārdi {self.words:5d}   teksts aptver {self.coverage:6.1%} skaņas   "
            f"vidējā ticamība {self.mean_prob:5.2f}   neskaidri {self.low_share:6.1%}"
        )


def score(transcript: Transcript) -> Score:
    probs = [w.prob for s in transcript.segments for w in s.words]
    sound = sum(b - a for a, b in transcript.speech)
    covered = sum(_covered(a, b, transcript.segments) for a, b in transcript.speech)
    coverage = covered / sound if sound else 0.0
    if not probs:
        return Score(0, 0.0, 1.0, coverage)
    return Score(len(probs), sum(probs) / len(probs), sum(p < LOW_PROB for p in probs) / len(probs), coverage)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Salīdzina audio uzlabošanas iestatījumus uz īstiem ierakstiem.")
    parser.add_argument("files", nargs="+", type=Path)
    parser.add_argument("--out", type=Path, required=True, help="mape rezultātiem (WAV un teksti)")
    parser.add_argument("--presets", default=",".join(ENHANCE_PRESETS), help="piem. off,voice")
    parser.add_argument("--prompt", default=None, help="termini, ko modelim parādīt (kā vārdnīca)")
    args = parser.parse_args(argv)

    presets = [p.strip() for p in args.presets.split(",") if p.strip()]
    unknown = [p for p in presets if p not in ENHANCE_PRESETS]
    if unknown:
        parser.error(f"nezināms iestatījums: {', '.join(unknown)}")
    missing = [str(f) for f in args.files if not f.is_file()]
    if missing:
        parser.error(f"nav faila: {', '.join(missing)}")

    os.environ.setdefault("DATABASE_URL", "postgresql://unused/unused")
    from .config import load_settings  # noqa: PLC0415

    settings = load_settings()
    print(f"Modelis: {settings.asr_model}  ierīce: {settings.asr_device}", flush=True)
    transcriber = make_transcriber(settings)
    args.out.mkdir(parents=True, exist_ok=True)

    for src in args.files:
        print(f"\n== {src.name}", flush=True)
        results: list[tuple[str, Score]] = []
        for preset in presets:
            wav = args.out / f"{src.stem}.{preset}.wav"
            normalize(src, wav, enhance=preset)
            started = time.monotonic()
            transcript = transcriber.transcribe(wav, args.prompt)
            took = time.monotonic() - started
            text = "\n".join(f"[{s.start:7.1f}] {s.text.strip()}" for s in transcript.segments)
            (args.out / f"{src.stem}.{preset}.txt").write_text(text + "\n", encoding="utf-8")
            sc = score(transcript)
            results.append((preset, sc))
            print(f"  {preset:8s} {sc.line()}   ({took:.0f} s uz {wav_duration(wav):.0f} s audio)", flush=True)
        best = max(results, key=lambda r: (round(r[1].coverage, 1), r[1].mean_prob))
        print(f"  -> labākais: {best[0]}. Pārbaudiet tekstus mapē {args.out}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
