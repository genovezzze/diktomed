"""Word and character error rates, same normalisation as the web app."""

from __future__ import annotations

import re

_EDGE_PUNCT = re.compile(r"^[\s.,;:!?()\[\]{}\"'«»„“”‘’…-]+|[\s.,;:!?()\[\]{}\"'«»„“”‘’…-]+$")


def normalize_word(word: str) -> str:
    return _EDGE_PUNCT.sub("", word).lower()


def words(text: str) -> list[str]:
    return [w for w in (normalize_word(t) for t in text.split()) if w]


def edit_distance(a: list[str] | str, b: list[str] | str) -> int:
    prev = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        cur = [i] + [0] * len(b)
        for j in range(1, len(b) + 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] != b[j - 1]))
        prev = cur
    return prev[len(b)]


def wer(reference: str, hypothesis: str) -> tuple[int, int]:
    """(edits, reference words)."""
    ref, hyp = words(reference), words(hypothesis)
    return edit_distance(ref, hyp), len(ref)


def cer(reference: str, hypothesis: str) -> tuple[int, int]:
    """(edits, reference characters), on normalised text with single spaces."""
    ref = " ".join(words(reference))
    hyp = " ".join(words(hypothesis))
    return edit_distance(ref, hyp), len(ref)
