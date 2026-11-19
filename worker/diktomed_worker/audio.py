"""Audio preparation with ffmpeg: every input becomes 16 kHz mono PCM WAV."""

from __future__ import annotations

import subprocess
import wave
from pathlib import Path

SAMPLE_RATE = 16_000


class AudioError(Exception):
    """The file could not be decoded. The message is safe to show to users."""


# Optional clean-up before recognition (AUDIO_ENHANCE). Off by default:
# Whisper copes with ordinary noise, and every filter can also make a good
# recording worse, so a preset is switched on only after compare.py shows it
# helps on the hospital's own recordings.
ENHANCE_PRESETS: dict[str, list[str]] = {
    "off": [],
    # Light FFT denoise for a steady background (ventilation, hum).
    "denoise": ["afftdn=nf=-25"],
    # Muffled dictaphone or cassette sound: almost nothing above 3 kHz and a
    # boxy peak around 500 Hz, so consonants drown. Cut the boom, lift the
    # 1-4 kHz band where consonants live, remove the steady hiss and even out
    # loud and quiet passages.
    "voice": [
        "highpass=f=200",
        "equalizer=f=520:width_type=o:width=1:g=-9",
        "equalizer=f=2500:width_type=o:width=2:g=8",
        "afftdn=nf=-30",
        "dynaudnorm=f=150:g=15:p=0.9",
    ],
}


def normalize(src: Path, dst: Path, enhance: str = "off", timeout: int = 900) -> None:
    """Decode any supported format (WAV, MP3, M4A, OGG, FLAC, DSS...) to the
    format the recogniser and the browser player both use."""
    if enhance not in ENHANCE_PRESETS:
        raise ValueError(f"unknown enhance preset {enhance!r}")
    filters = ["highpass=f=80", *ENHANCE_PRESETS[enhance], "lowpass=f=7800"]
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
