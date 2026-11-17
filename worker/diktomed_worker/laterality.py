"""Operation side check: left/right in the dictation against the planned side.

Wrong-site surgery documentation is a patient-safety error, so a mismatch is a
high-risk flag. "kreis-" always means left. "lab-" also means "good" in
Latvian ("labā stāvoklī"), so it counts as "right" only next to a body part.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

LEFT, RIGHT, BOTH = "LEFT", "RIGHT", "BOTH"
SIDE_LV = {LEFT: "kreisā", RIGHT: "labā", BOTH: "abas puses"}

_LEFT = re.compile(r"^kreis(?:ā|ais|o|ajā|ās|ajam|ajai|ie|ajos|ajās|ajiem|ajām)$", re.IGNORECASE)
_RIGHT = re.compile(r"^lab(?:ā|ais|o|ajā|ās|ajam|ajai|ie|ajos|ajās|ajiem|ajām)$", re.IGNORECASE)

# Stems of body parts and "side" itself. Matching is by prefix.
_ANATOMY = (
    "pus", "ceļ", "gūž", "plec", "rok", "kāj", "nier", "krūt", "plauš", "ac", "aus", "elkoņ", "elkon",
    "potīt", "pēd", "plaukst", "sēklinie", "olnīc", "cirkšņ", "apakšdelm", "augšstilb", "stilb",
    "lāpstiņ", "atslēgkaul", "delm", "vaig", "žokl", "hemitorak", "daiv", "virsnier", "ciska",
    "ciskas", "apakšstilb", "pirkst", "īkšķ", "krūškurv", "deniņ", "sān", "menisk", "locītav",
)
_STRIP = ".,;:!?()[]{}\"'«»„“”…"


@dataclass(frozen=True)
class SideMention:
    side: str
    first: int  # token index
    last: int  # token index (side word plus the body part)


def _clean(token: str) -> str:
    return token.strip(_STRIP).lower()


def _anatomy_within(tokens: list[str], i: int, window: int = 2) -> int | None:
    for j in range(i + 1, min(len(tokens), i + 1 + window)):
        if any(_clean(tokens[j]).startswith(stem) for stem in _ANATOMY):
            return j
        if tokens[j].rstrip().endswith((".", ";", ":")):
            break
    return None


def find_sides(tokens: list[str]) -> list[SideMention]:
    out: list[SideMention] = []
    for i, tok in enumerate(tokens):
        word = _clean(tok)
        if _LEFT.match(word):
            j = _anatomy_within(tokens, i)
            out.append(SideMention(LEFT, i, j if j is not None else i))
        elif _RIGHT.match(word):
            j = _anatomy_within(tokens, i)
            if j is not None:
                out.append(SideMention(RIGHT, i, j))
    return out
