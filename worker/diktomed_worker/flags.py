"""Review flags: the places a person should listen to before approving.

Flags only point at text and propose; they never change it. Each flag is
about the draft, never about the person who dictated or reviewed it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .asr import Segment, Word
from .laterality import _LEFT, _RIGHT, BOTH, LEFT, RIGHT, SIDE_LV, find_sides
from .numbers_lv import find_numbers, is_number_token

HIGH, MEDIUM, INFO = "HIGH", "MEDIUM", "INFO"


@dataclass
class FlagDraft:
    kind: str
    severity: str
    segment_index: int
    start: float
    end: float
    message: str
    excerpt: str | None = None
    suggestion: str | None = None


@dataclass(frozen=True)
class Correction:
    wrong: str  # lower-case, as stored by the web app
    right: str
    count: int


# Phrases Whisper is known to invent in silence (from subtitle training data).
_HALLUCINATION_PHRASES = (
    "paldies par skatīšanos",
    "paldies, ka skatījāties",
    "abonējiet",
    "subtitrus",
    "subtitri",
    "thank you for watching",
    "thanks for watching",
    "спасибо за просмотр",
    "продолжение следует",
    "субтитры",
)


def is_protected_correction(c: Correction) -> bool:
    """Side and number changes are never suggested, even if one got learned:
    such a fix belongs to one patient, not to the vocabulary."""
    for word in (c.wrong + " " + c.right).split():
        w = word.strip(".,;:!?()\"'«»").lower()
        if _LEFT.match(w) or _RIGHT.match(w) or is_number_token(w):
            return True
    return False


def _pct(p: float) -> str:
    return f"{round(p * 100)}%"


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def segment_text(seg: Segment) -> str:
    """Canonical text of a segment: its words joined, or its text."""
    if seg.words:
        return "".join(w.text for w in seg.words).strip()
    return seg.text.strip()


def _word_spans(seg: Segment) -> list[tuple[int, int, Word]]:
    """Character span of each word inside segment_text(seg)."""
    spans: list[tuple[int, int, Word]] = []
    joined = "".join(w.text for w in seg.words)
    offset = len(joined) - len(joined.lstrip())
    pos = 0
    for w in seg.words:
        start = pos + (len(w.text) - len(w.text.lstrip()))
        end = pos + len(w.text.rstrip())
        spans.append((start - offset, end - offset, w))
        pos += len(w.text)
    return spans


def _time_for_chars(seg: Segment, start: int, end: int) -> tuple[float, float]:
    hits = [w for (s, e, w) in _word_spans(seg) if s < end and e > start]
    if not hits:
        return seg.start, seg.end
    return hits[0].start, hits[-1].end


def _token_positions(text: str, tokens: list[str]) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    cursor = 0
    for tok in tokens:
        start = text.index(tok, cursor)
        out.append((start, start + len(tok)))
        cursor = start + len(tok)
    return out


def side_flags(segments: list[Segment], planned_side: str | None) -> list[FlagDraft]:
    """Left/right mentions against the side planned for the operation."""
    mentions = []
    for idx, seg in enumerate(segments):
        text = segment_text(seg)
        tokens = text.split()
        pos = _token_positions(text, tokens)
        for m in find_sides(tokens):
            c0, c1 = pos[m.first][0], pos[m.last][1]
            excerpt = text[c0:c1].rstrip(".,;:!?")
            t0, t1 = _time_for_chars(seg, c0, c1)
            mentions.append((idx, m.side, excerpt, t0, t1))

    flags: list[FlagDraft] = []
    if planned_side in (LEFT, RIGHT):
        for idx, side, excerpt, t0, t1 in mentions:
            if side != planned_side:
                flags.append(
                    FlagDraft(
                        "SIDE_MISMATCH",
                        HIGH,
                        idx,
                        t0,
                        t1,
                        f"Iespējama operācijas puses nesakritība: plānotā - {SIDE_LV[planned_side]}, diktātā - «{excerpt}».",
                        excerpt=excerpt,
                    )
                )
        if not mentions and segments:
            flags.append(
                FlagDraft(
                    "SIDE_MISMATCH",
                    INFO,
                    0,
                    segments[0].start,
                    segments[0].end,
                    f"Diktātā nav minēta operācijas puse (plānotā - {SIDE_LV[planned_side]}).",
                )
            )
    elif planned_side != BOTH:
        if {LEFT, RIGHT} <= {side for _, side, *_ in mentions}:
            for idx, side, excerpt, t0, t1 in mentions:
                flags.append(
                    FlagDraft(
                        "SIDE_MISMATCH",
                        MEDIUM,
                        idx,
                        t0,
                        t1,
                        f"Diktātā minētas abas puses. Pārbaudiet, vai «{excerpt}» ir pareizi.",
                        excerpt=excerpt,
                    )
                )
    return sorted(flags, key=lambda f: (f.start, f.end))


def _hallucination(seg: Segment, text: str, previous: str | None) -> str | None:
    n = _norm(text)
    if any(p in n for p in _HALLUCINATION_PHRASES):
        return "Iespējama halucinācija: tipiska frāze, ko modelis mēdz izdomāt klusumā."
    if (seg.no_speech_prob or 0) > 0.6 and (seg.avg_logprob if seg.avg_logprob is not None else 0) < -0.8:
        return f"Iespējama halucinācija: šeit, visticamāk, nav runas (ticamība {_pct(seg.confidence)})."
    if (seg.compression_ratio or 0) > 2.4:
        return "Iespējama halucinācija: teksts atkārtojas, modelis, iespējams, iestrēdzis cilpā."
    if previous is not None and len(n.split()) >= 3 and n == previous:
        return "Iespējama halucinācija: rinda atkārto iepriekšējo."
    if len(n.split()) <= 1 and seg.confidence < 0.5:
        return f"Iespējama halucinācija: visai rindai zema atpazīšanas ticamība ({_pct(seg.confidence)}), iespējams, tā nav runa."
    return None


def build_flags(
    segments: list[Segment],
    line_threshold: float,
    word_threshold: float,
    corrections: list[Correction],
    planned_side: str | None = None,
) -> list[FlagDraft]:
    flags: list[FlagDraft] = side_flags(segments, planned_side)
    previous_norm: str | None = None

    for idx, seg in enumerate(segments):
        text = segment_text(seg)
        if not text:
            continue

        halluc = _hallucination(seg, text, previous_norm)
        previous_norm = _norm(text)
        if halluc:
            # Proposed fix: delete the line. A person decides after listening.
            flags.append(FlagDraft("POSSIBLE_HALLUCINATION", HIGH, idx, seg.start, seg.end, halluc, excerpt=text, suggestion=""))
            continue

        conf = seg.confidence
        if conf < line_threshold:
            sev = HIGH if conf < 0.5 else MEDIUM
            flags.append(
                FlagDraft("LOW_CONFIDENCE_LINE", sev, idx, seg.start, seg.end, f"Zema rindas ticamība ({_pct(conf)}). Noklausieties fragmentu.")
            )
        else:
            # Runs of unclear words, only where the line as a whole looks fine.
            run: list[Word] = []
            for w in [*seg.words, None]:
                if w is not None and w.prob < word_threshold:
                    run.append(w)
                    continue
                if run:
                    excerpt = "".join(x.text for x in run).strip()
                    low = min(x.prob for x in run)
                    flags.append(
                        FlagDraft(
                            "LOW_CONFIDENCE_WORD",
                            MEDIUM,
                            idx,
                            run[0].start,
                            run[-1].end,
                            f"Neskaidri sadzirdēts: «{excerpt}» (ticamība {_pct(low)}).",
                            excerpt=excerpt,
                        )
                    )
                    run = []

        # Numbers: doses, volumes, pressures are checked against the audio.
        tokens = text.split()
        char_pos = _token_positions(text, tokens)
        for span in find_numbers(tokens):
            last = span.last + (1 if span.has_unit and span.last + 1 < len(tokens) else 0)
            c_start, c_end = char_pos[span.first][0], char_pos[last][1]
            excerpt = text[c_start:c_end].rstrip(".,;:!?")
            t0, t1 = _time_for_chars(seg, c_start, c_end)
            flags.append(
                FlagDraft(
                    "NUMBER",
                    MEDIUM if span.has_unit else INFO,
                    idx,
                    t0,
                    t1,
                    f"Pārbaudiet skaitli «{excerpt}»" + (" un mērvienību." if span.has_unit else "."),
                    excerpt=excerpt,
                )
            )

        # Words people have corrected before.
        lower = text.lower()
        for c in corrections:
            if is_protected_correction(c):
                continue
            for m in re.finditer(r"(?<!\w)" + re.escape(c.wrong) + r"(?!\w)", lower):
                excerpt = text[m.start() : m.end()]
                if excerpt == c.right:
                    continue
                t0, t1 = _time_for_chars(seg, m.start(), m.end())
                flags.append(
                    FlagDraft(
                        "TERM",
                        MEDIUM,
                        idx,
                        t0,
                        t1,
                        f"Šo vārdu cilvēki jau {c.count}× labojuši uz «{c.right}».",
                        excerpt=excerpt,
                        suggestion=c.right,
                    )
                )
    return sorted(flags, key=lambda f: (f.start, f.end))
