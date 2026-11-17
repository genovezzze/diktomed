"""Finds numbers in Latvian text: digits and number words, with units.

A misheard number in a protocol (a dose, a blood loss, a pressure) is the
kind of error that matters most, so every number becomes a check item.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_NUMBER_WORD = re.compile(
    r"^(?:nulle|"
    r"vien(?:s|a|u|as|i|ām|iem)|"
    r"div(?:i|as|us|iem|ām)|trīs|trijiem|trim|"
    r"četr(?:i|as|us|iem|ām)|piec(?:i|as|us|iem|ām)|seš(?:i|as|us|iem|ām)|"
    r"septiņ(?:i|as|us|iem|ām)|astoņ(?:i|as|us|iem|ām)|deviņ(?:i|as|us|iem|ām)|"
    r"desmit|\w+padsmit|\w+desmit|\w*simt(?:s|i|u|iem)?|tūksto\w*|pusotr[aui])$",
    re.IGNORECASE,
)
_DIGITS = re.compile(r"^\d+(?:[.,]\d+)?%?$")

_UNIT_PREFIXES = (
    "mg", "mcg", "µg", "g", "kg", "ml", "l", "mm", "cm", "mmhg", "mmol", "%", "°c",
    "grād", "reiz", "vienīb", "tablet", "tabl", "pilien", "minūt", "min", "stund", "h",
    "miligram", "mililitr", "milimetr", "centimetr", "procent", "litr", "gram", "dzīvsudrab",
)
_EXACT_SHORT_UNITS = {"mg", "mcg", "µg", "g", "kg", "ml", "l", "mm", "cm", "mmhg", "mmol", "%", "°c", "min", "h", "tabl"}

_STRIP = ".,;:!?()[]{}\"'«»„“”…"


def _clean(token: str) -> str:
    return token.strip().strip(_STRIP)


def is_number_token(token: str) -> bool:
    t = _clean(token)
    return bool(t) and bool(_DIGITS.match(t) or _NUMBER_WORD.match(t))


def is_unit_token(token: str) -> bool:
    t = _clean(token).lower()
    if not t:
        return False
    if t in _EXACT_SHORT_UNITS:
        return True
    return any(t.startswith(p) for p in _UNIT_PREFIXES if len(p) > 2)


@dataclass(frozen=True)
class NumberSpan:
    first: int  # token index, inclusive
    last: int  # token index, inclusive
    has_unit: bool


def find_numbers(tokens: list[str]) -> list[NumberSpan]:
    """Runs of number tokens ("simt divdesmit astoņi", "12,5"), and whether a
    unit follows. Tokens are whitespace-split words, punctuation attached."""
    spans: list[NumberSpan] = []
    i = 0
    while i < len(tokens):
        if not is_number_token(tokens[i]):
            i += 1
            continue
        j = i
        # A run continues only while the previous word has no closing punctuation.
        while j + 1 < len(tokens) and is_number_token(tokens[j + 1]) and not tokens[j].rstrip().endswith((".", ",", ";", ":")):
            j += 1
        unit = j + 1 < len(tokens) and is_unit_token(tokens[j + 1]) and not tokens[j].rstrip().endswith((".", ";", ":"))
        if not unit and _clean(tokens[j]).endswith("%"):
            unit = True
        spans.append(NumberSpan(i, j, unit))
        i = j + 1
    return spans
