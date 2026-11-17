"""The recogniser hint: Whisper's initial prompt built from the vocabulary."""

from __future__ import annotations

# Whisper reads at most 224 prompt tokens; Latvian runs about 3 characters a
# token, so stay well under that.
MAX_PROMPT_CHARS = 450


def build_initial_prompt(terms: list[str], learned: list[str], max_chars: int = MAX_PROMPT_CHARS) -> str | None:
    """A short Latvian sentence listing terms. Written in Latvian on purpose:
    a prompt in another language nudges Whisper towards translating."""
    seen: set[str] = set()
    ordered: list[str] = []
    for t in [*learned, *terms]:
        t = " ".join(t.split())
        key = t.lower()
        if t and key not in seen:
            seen.add(key)
            ordered.append(t)
    if not ordered:
        return None

    prefix = "Operācijas protokols. Termini: "
    out = prefix
    for t in ordered:
        piece = (", " if out != prefix else "") + t
        if len(out) + len(piece) + 1 > max_chars:
            break
        out += piece
    return out + "."
