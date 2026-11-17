import wave
from pathlib import Path

from training.export_dataset import cut_clip, is_test


def _write_wav(path: Path, seconds: float, rate: int = 16_000) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"\x01\x00" * int(seconds * rate))


def test_cut_clip_pads_and_clamps(tmp_path: Path):
    src = tmp_path / "a.wav"
    _write_wav(src, 10)
    assert cut_clip(src, tmp_path / "c1.wav", 2.0, 3.0, pad=0.15) == 1.3
    # Padding never runs past the file edges.
    assert cut_clip(src, tmp_path / "c2.wav", 0.05, 0.5, pad=0.15) == 0.65
    assert cut_clip(src, tmp_path / "c3.wav", 9.5, 10.0, pad=0.15) == 0.65
    with wave.open(str(tmp_path / "c1.wav"), "rb") as w:
        assert w.getframerate() == 16_000 and w.getnchannels() == 1


def test_split_is_by_recording_and_stable():
    ids = [f"00000000-0000-0000-0000-{i:012d}" for i in range(2000)]
    test = [i for i in ids if is_test(i, 0.1)]
    assert 150 < len(test) < 250
    assert test == [i for i in ids if is_test(i, 0.1)]
