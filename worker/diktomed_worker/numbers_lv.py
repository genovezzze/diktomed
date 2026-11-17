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


# A token that starts with digits, maybe after "~"/"≈"/"<", maybe with a unit
# glued on: "100", "~200", "12,5", "100mg", "37°C".
_DIGIT_LED = re.compile(r"^[~≈<>±]?\d+(?:[.,]\d+)?(?P<unit>[^\d\s.,]\S*)?$")


def is_number_token(token: str) -> bool:
    t = _clean(token)
    return bool(t) and bool(_DIGITS.match(t) or _DIGIT_LED.match(t) or _NUMBER_WORD.match(t))


def _glued_unit(token: str) -> bool:
    m = _DIGIT_LED.match(_clean(token))
    return bool(m and m.group("unit"))


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
    unit_next: bool = False  # the unit is the next token (not glued on)


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
        glued = _clean(tokens[j]).endswith("%") or _glued_unit(tokens[j])
        unit_next = (
            not glued
            and j + 1 < len(tokens)
            and is_unit_token(tokens[j + 1])
            and not tokens[j].rstrip().endswith((".", ";", ":", ","))
        )
        spans.append(NumberSpan(i, j, glued or unit_next, unit_next))
        i = j + 1
    return spans


# --- values ------------------------------------------------------------------

_UNITS = [
    (r"nulle", 0), (r"vien(?:s|a|u|as|i|ām|iem)", 1), (r"div(?:i|as|us|iem|ām)", 2),
    (r"trīs|trijiem|trim", 3), (r"četr(?:i|as|us|iem|ām)", 4), (r"piec(?:i|as|us|iem|ām)", 5),
    (r"seš(?:i|as|us|iem|ām)", 6), (r"septiņ(?:i|as|us|iem|ām)", 7), (r"astoņ(?:i|as|us|iem|ām)", 8),
    (r"deviņ(?:i|as|us|iem|ām)", 9),
]
_STEMS = ["", "vien", "div", "trīs", "četr", "piec", "seš", "septiņ", "astoņ", "deviņ"]


def word_value(token: str) -> tuple[float, str] | None:
    """(value, kind) of one number word: kind is "unit", "hundred" or "thousand"."""
    t = _clean(token).lower()
    if not t:
        return None
    if _DIGITS.match(t):
        return float(t.rstrip("%").replace(",", ".")), "unit"
    if t == "desmit":
        return 10.0, "unit"
    if t.endswith("padsmit"):
        stem = t[: -len("padsmit")]
        return (10.0 + _STEMS.index(stem), "unit") if stem in _STEMS[1:] else None
    if t.endswith("desmit"):
        stem = t[: -len("desmit")]
        return (10.0 * _STEMS.index(stem), "unit") if stem in _STEMS[2:] else None
    m = re.match(r"^(\w*?)simt(?:s|i|u|iem)?$", t)
    if m:
        stem = m.group(1)
        if stem == "":
            return 100.0, "hundred"
        return (100.0 * _STEMS.index(stem), "unit") if stem in _STEMS[2:] else None
    if t.startswith("tūksto"):
        return 1000.0, "thousand"
    if t in ("pusotra", "pusotru", "pusotri"):
        return 1.5, "unit"
    for pattern, value in _UNITS:
        if re.fullmatch(pattern, t):
            return float(value), "unit"
    return None


def parse_numbers(text: str) -> list[float]:
    """Every number in a text as a value: "simt divdesmit astoņi" -> 128,
    "piecdesmit četrus" -> 54, "divi simti" -> 200, "12,5 mg" -> 12.5."""
    # "~200 ml", "≈20", "<5", "200ml", "5mg" -> the digits stand on their own.
    text = re.sub(r"[~≈<>±]", " ", text)
    text = re.sub(r"(\d)(?=[^\d\s.,%])", r"\1 ", text)
    tokens = text.split()
    values: list[float] = []
    for span in find_numbers(tokens):
        total = 0.0
        current = 0.0
        for tok in tokens[span.first : span.last + 1]:
            parsed = word_value(tok)
            if parsed is None:
                continue
            value, kind = parsed
            if kind == "hundred":
                current = current * 100 if 0 < current < 10 else current + 100
            elif kind == "thousand":
                total += (current or 1) * 1000
                current = 0.0
            else:
                current += value
        values.append(total + current)
    return values
