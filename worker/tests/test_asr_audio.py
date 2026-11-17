import wave
from pathlib import Path

import pytest

np = pytest.importorskip("numpy")

from diktomed_worker.asr import read_wav_float32  # noqa: E402


def test_reads_pcm16_mono_as_float32(tmp_path: Path):
    p = tmp_path / "a.wav"
    with wave.open(str(p), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(np.array([0, 16384, -32768], dtype=np.int16).tobytes())
    samples = read_wav_float32(p)
    assert samples.dtype == np.float32
    assert samples.tolist() == [0.0, 0.5, -1.0]
