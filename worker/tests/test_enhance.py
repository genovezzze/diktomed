import math
import shutil
import struct
import wave
from pathlib import Path

import pytest

from diktomed_worker.audio import ENHANCE_PRESETS, normalize, wav_duration
from diktomed_worker.config import load_settings

needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")


def tone(path: Path, seconds: float = 1.0, rate: int = 44_100) -> None:
    """A short stereo test signal (a vowel-like mix of 500 Hz and 2.5 kHz)."""
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(rate)
        frames = bytearray()
        for i in range(int(seconds * rate)):
            v = int(8000 * (math.sin(2 * math.pi * 500 * i / rate) + 0.3 * math.sin(2 * math.pi * 2500 * i / rate)))
            frames += struct.pack("<hh", v, v)
        w.writeframes(bytes(frames))


@needs_ffmpeg
@pytest.mark.parametrize("preset", list(ENHANCE_PRESETS))
def test_every_preset_gives_16k_mono_of_the_same_length(tmp_path: Path, preset: str):
    src, dst = tmp_path / "in.wav", tmp_path / "out.wav"
    tone(src)
    normalize(src, dst, enhance=preset)
    with wave.open(str(dst), "rb") as w:
        assert (w.getnchannels(), w.getframerate(), w.getsampwidth()) == (1, 16_000, 2)
    assert abs(wav_duration(dst) - 1.0) < 0.05


def test_unknown_preset_is_refused(tmp_path: Path):
    with pytest.raises(ValueError):
        normalize(tmp_path / "in.wav", tmp_path / "out.wav", enhance="magic")


def test_setting_and_old_denoise_flag():
    base = {"DATABASE_URL": "postgresql://x/y"}
    assert load_settings(base).audio_enhance == "off"
    assert load_settings({**base, "AUDIO_DENOISE": "true"}).audio_enhance == "denoise"
    assert load_settings({**base, "AUDIO_ENHANCE": "voice", "AUDIO_DENOISE": "true"}).audio_enhance == "voice"
    with pytest.raises(SystemExit):
        load_settings({**base, "AUDIO_ENHANCE": "magic"})


@needs_ffmpeg
def test_compare_writes_audio_and_text_for_every_preset(tmp_path: Path, monkeypatch, capsys):
    from diktomed_worker import compare

    monkeypatch.setenv("ASR_BACKEND", "fake")
    src = tmp_path / "Operacija_1.wav"
    tone(src)
    out = tmp_path / "rezultati"
    assert compare.main([str(src), "--out", str(out)]) == 0
    for preset in ENHANCE_PRESETS:
        assert (out / f"Operacija_1.{preset}.wav").is_file()
        assert (out / f"Operacija_1.{preset}.txt").read_text(encoding="utf-8").strip()
    printed = capsys.readouterr().out
    assert "labākais" in printed and "aptver" in printed
