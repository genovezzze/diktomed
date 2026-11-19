"""Splits a recording into pieces for the recogniser, by loudness.

The usual voice detector (Silero, inside faster-whisper) is a neural network
trained on clear speech. On muffled dictaphone or cassette audio it misses
most of the speech, and whatever it misses never reaches the model. Loudness
is a dumber but safer test: anything clearly above the recording's own
background counts, so only real silence is left out. Pieces are cut in
pauses and kept short, so one bad decoding decision loses little.
"""

from __future__ import annotations

import numpy as np

SAMPLE_RATE = 16_000
FRAME = 480  # 30 ms
ABOVE_FLOOR_DB = 8.0  # how much louder than the background counts as sound
BRIDGE_SECONDS = 0.8  # pauses shorter than this stay inside a piece
MIN_SOUND_SECONDS = 0.3  # shorter blips (a click, a cough) are ignored
PAD_SECONDS = 0.3


def _frame_db(audio: np.ndarray) -> np.ndarray:
    n = len(audio) // FRAME
    if n == 0:
        return np.zeros(0)
    frames = audio[: n * FRAME].reshape(n, FRAME).astype(np.float64)
    return 20 * np.log10(np.sqrt((frames**2).mean(axis=1)) + 1e-9)


def _runs(mask: np.ndarray) -> list[tuple[int, int]]:
    """[start, end) frame ranges where mask is True."""
    edges = np.diff(np.concatenate(([0], mask.astype(np.int8), [0])))
    return list(zip(np.flatnonzero(edges == 1).tolist(), np.flatnonzero(edges == -1).tolist()))


def sound_regions(audio: np.ndarray) -> list[tuple[int, int]]:
    """Sample ranges that are clearly louder than the recording's background."""
    db = _frame_db(audio)
    if len(db) == 0:
        return []
    floor = float(np.percentile(db, 10))
    active = db > max(floor + ABOVE_FLOOR_DB, -60.0)
    # Close short pauses, then drop short blips.
    bridge = int(BRIDGE_SECONDS * SAMPLE_RATE / FRAME)
    for start, end in _runs(~active):
        if end - start < bridge and start > 0 and end < len(active):
            active[start:end] = True
    min_len = int(MIN_SOUND_SECONDS * SAMPLE_RATE / FRAME)
    pad = int(PAD_SECONDS * SAMPLE_RATE)
    regions = []
    for start, end in _runs(active):
        if end - start >= min_len:
            regions.append((max(0, start * FRAME - pad), min(len(audio), end * FRAME + pad)))
    merged: list[tuple[int, int]] = []
    for start, end in regions:
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def split_long(audio: np.ndarray, start: int, end: int, max_seconds: float) -> list[tuple[int, int]]:
    """Cuts [start, end) into pieces of at most max_seconds, each cut at the
    quietest moment of the last 40 % of the allowed length (a breath, a pause)."""
    limit = int(max_seconds * SAMPLE_RATE)
    pieces = []
    while end - start > limit:
        lo, hi = start + int(limit * 0.6), start + limit
        db = _frame_db(audio[lo:hi])
        cut = lo + (int(np.argmin(db)) * FRAME + FRAME // 2 if len(db) else limit - lo)
        pieces.append((start, cut))
        start = cut
    pieces.append((start, end))
    return pieces


def pieces(audio: np.ndarray, max_seconds: float = 20.0) -> list[tuple[int, int]]:
    """The sample ranges to recognise, in order, each at most max_seconds long."""
    out: list[tuple[int, int]] = []
    for start, end in sound_regions(audio):
        out.extend(split_long(audio, start, end, max_seconds))
    return out
