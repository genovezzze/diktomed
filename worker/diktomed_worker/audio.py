"""Audio preparation with ffmpeg: every input becomes 16 kHz mono PCM WAV."""

from __future__ import annotations

import subprocess
import wave
from pathlib import Path

SAMPLE_RATE = 16_000


class AudioError(Exception):
    """The file could not be decoded. The message is safe to show to users."""


def normalize(src: Path, dst: Path, denoise: bool = False, timeout: int = 900) -> None:
    """Decode any supported format (WAV, MP3, M4A, OGG, FLAC, DSS...) to the
    format the recogniser and the browser player both use."""
    filters = ["highpass=f=80", "lowpass=f=7800"]
    if denoise:
        # Light FFT denoise for noisy rooms. Off by default: Whisper copes with
        # noise well and heavy denoising can smear consonants.
        filters.append("afftdn=nf=-25")
    cmd = [
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(src),
        "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE),
        "-af", ",".join(filters),
        "-c:a", "pcm_s16le",
        str(dst),
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=timeout)
    except FileNotFoundError as exc:  # pragma: no cover - deployment problem
        raise AudioError("Serverī nav uzstādīts ffmpeg.") from exc
    except subprocess.TimeoutExpired as exc:
        raise AudioError("Audio faila apstrāde ilga pārāk ilgi.") from exc
    except subprocess.CalledProcessError as exc:
        raise AudioError("Neizdevās nolasīt audio failu: formāts netiek atbalstīts vai fails ir bojāts.") from exc


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as w:
        return w.getnframes() / float(w.getframerate())
