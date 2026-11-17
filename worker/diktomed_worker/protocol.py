"""Structured operation protocol from an APPROVED transcript.

The protocol is never written from audio and never from the model's memory:
every field is a value plus the exact passages of the approved text it rests
on. Each field is then checked against the text:

  - every quote must really be in the approved text,
  - every number in the value must be in its quotes ("20 ml" <- "divdesmit mililitriem"),
  - the side in the value must be the side in its quotes and the planned side.

A field that fails a check is shown as a warning; a person accepts, edits or
rejects every field. Two extractors fill the fields:

  - "llm": a language model on the hospital network (LLM_BASE_URL),
  - "rules": keyword rules, no model at all. Works on any server, and is the
    fallback and the demo mode.
"""

from __future__ import annotations

import json
import logging
import re
import urllib.request
from dataclasses import dataclass, field

from .laterality import BOTH, LEFT, RIGHT, SIDE_LV, find_sides
from .numbers_lv import parse_numbers

log = logging.getLogger(__name__)

OK, EMPTY, NO_QUOTE, QUOTE_NOT_FOUND, NUMBER_MISMATCH, SIDE_MISMATCH = (
    "OK", "EMPTY", "NO_QUOTE", "QUOTE_NOT_FOUND", "NUMBER_MISMATCH", "SIDE_MISMATCH",
)

MAX_VALUE_CHARS = 2000
MAX_QUOTES = 6


@dataclass(frozen=True)
class Section:
    key: str
    title: str
    hint: str
    position: int
    multi: bool


@dataclass
class FieldDraft:
    key: str
    value: str | None
    quotes: list[str] = field(default_factory=list)
    check: str = OK
    check_message: str | None = None


# --- checks ------------------------------------------------------------------


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def _sides(text: str) -> set[str]:
    return {m.side for m in find_sides(text.split())}


def _fmt(n: float) -> str:
    return str(int(n)) if n == int(n) else str(n).replace(".", ",")


def validate(draft: FieldDraft, source: str, planned_side: str | None) -> FieldDraft:
    """Fills draft.check / check_message. Order: the worst problem wins."""
    value = (draft.value or "").strip()
    if not value:
        draft.value, draft.quotes = None, []
        draft.check, draft.check_message = EMPTY, "Diktātā nav minēts."
        return draft
    if not draft.quotes:
        draft.check, draft.check_message = NO_QUOTE, "Nav norādīts, no kuras teksta vietas ņemta vērtība."
        return draft

    src = _norm(source)
    missing = [q for q in draft.quotes if _norm(q) not in src]
    if missing:
        draft.check = QUOTE_NOT_FOUND
        draft.check_message = f"Citāts apstiprinātajā tekstā nav atrasts: «{missing[0][:80]}»."
        return draft

    quoted = " ".join(draft.quotes)
    have = parse_numbers(quoted)
    extra = [n for n in parse_numbers(value) if not any(abs(n - h) < 1e-6 for h in have)]
    if extra:
        draft.check = NUMBER_MISMATCH
        draft.check_message = f"Skaitlis {', '.join(_fmt(n) for n in extra)} nav citātā. Pārbaudiet pret audio."
        return draft

    value_sides = _sides(value)
    if value_sides - _sides(quoted):
        draft.check, draft.check_message = SIDE_MISMATCH, "Puse vērtībā neatbilst citātam."
        return draft
    if planned_side in (LEFT, RIGHT) and value_sides and value_sides != {planned_side}:
        draft.check = SIDE_MISMATCH
        draft.check_message = f"Puse neatbilst plānotajai ({SIDE_LV[planned_side]})."
        return draft

    draft.check, draft.check_message = OK, None
    return draft


# --- rules extractor -----------------------------------------------------------

_SENTENCE = re.compile(r"(?<=[.!?])\s+")

# Keyword rules per default section. Unknown (hospital-added) sections stay
# empty in rules mode; the LLM extractor reads their hints instead.
_RULES: dict[str, re.Pattern[str]] = {
    "diagnoze": re.compile(r"diagnoz", re.I),
    "operacija": re.compile(r"(skopij|ektomij|tomij|plastik|osteosintēz|rezekcij|endoprotez)", re.I),
    "anestezija": re.compile(r"(anestēzij|narkoz)", re.I),
    "gaita": re.compile(r"(ievadīt|veikt[as]?\b|izdalīt|izskalot|sašūt|uzlikt|evakuēt|klipsēt|pārgriezt|hemostāz)", re.I),
    "atradne": re.compile(r"(konstatē|redzam|atrast|palielināt|sabiezēt|izsvīdum)", re.I),
    "asins_zudums": re.compile(r"asins zudum", re.I),
    "drenaza": re.compile(r"drenāž", re.I),
    "komplikacijas": re.compile(r"komplikācij", re.I),
    "histologija": re.compile(r"histolo", re.I),
    "nozimejumi": re.compile(r"(pēc operācijas|intravenoz|perorāl|miligram|\bmg\b)", re.I),
}
# A sentence that already named the operation or the anaesthesia is not also
# a step of its course.
_EXCLUSIVE_BEFORE = {"gaita": ("operacija", "anestezija", "drenaza", "nozimejumi"), "atradne": ("komplikacijas", "drenaza")}


def rules_extract(sections: list[Section], source: str) -> list[FieldDraft]:
    sentences = [s.strip() for s in _SENTENCE.split(" ".join(source.split())) if s.strip()]
    taken: dict[str, list[str]] = {}
    for section in sorted(sections, key=lambda s: (s.key in _EXCLUSIVE_BEFORE, s.position)):
        rule = _RULES.get(section.key)
        if rule is None:
            taken[section.key] = []
            continue
        blocked = {q for other in _EXCLUSIVE_BEFORE.get(section.key, ()) for q in taken.get(other, [])}
        hits = [s for s in sentences if rule.search(s) and s not in blocked]
        taken[section.key] = hits if section.multi else hits[:1]

    drafts: list[FieldDraft] = []
    for section in sections:
        quotes = taken.get(section.key, [])
        value = " ".join(quotes) or None
        if section.key == "asins_zudums" and quotes:
            # Normalised the way a protocol writes it: "ap divdesmit mililitriem" -> "~20 ml".
            numbers = parse_numbers(quotes[0])
            if numbers and re.search(r"(mililitr|\bml\b)", quotes[0], re.I):
                value = f"~{_fmt(numbers[0])} ml" if re.search(r"\b(ap|aptuveni|apmēram)\b", quotes[0], re.I) else f"{_fmt(numbers[0])} ml"
        drafts.append(FieldDraft(section.key, value, quotes))
    return drafts


# --- LLM extractor ---------------------------------------------------------------

SYSTEM_PROMPT = (
    "Tu aizpildi operācijas protokola laukus latviešu valodā TIKAI no dotā apstiprinātā "
    "diktāta teksta. Katram laukam atgriez \"value\" (īss, protokolam piemērots teksts) un "
    "\"quotes\" - precīzus, burtiskus fragmentus no teksta, uz kuriem vērtība balstās. "
    "Ja tekstā informācijas nav, \"value\": null un \"quotes\": []. Nepievieno faktus, kuru "
    "tekstā nav. Skaitļus, devas un pusi (kreisā/labā) nemaini un neizdomā. "
    "Atbildi tikai ar JSON: {\"fields\":[{\"key\":\"...\",\"value\":...,\"quotes\":[...]}]}"
)


def build_user_prompt(sections: list[Section], source: str) -> str:
    lines = ["Lauki:"]
    for s in sections:
        lines.append(f"- {s.key}: {s.title}. {s.hint}" + (" Var būt vairāki teikumi." if s.multi else ""))
    lines += ["", "Apstiprinātais teksts:", source]
    return "\n".join(lines)


def parse_llm_fields(raw: object, sections: list[Section]) -> list[FieldDraft]:
    """Turns the model's JSON into drafts; anything malformed becomes an empty field."""
    by_key: dict[str, FieldDraft] = {}
    items = raw.get("fields") if isinstance(raw, dict) else None
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict) or not isinstance(item.get("key"), str):
            continue
        value = item.get("value")
        value = value.strip()[:MAX_VALUE_CHARS] if isinstance(value, str) and value.strip() else None
        quotes_raw = item.get("quotes")
        quotes = [q.strip()[:600] for q in quotes_raw if isinstance(q, str) and q.strip()][:MAX_QUOTES] if isinstance(quotes_raw, list) else []
        by_key[item["key"]] = FieldDraft(item["key"], value, quotes)
    return [by_key.get(s.key, FieldDraft(s.key, None, [])) for s in sections]


def llm_extract(sections: list[Section], source: str, base_url: str, model: str, timeout: float) -> list[FieldDraft]:
    body = json.dumps(
        {
            "model": model,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": build_user_prompt(sections, source)},
            ],
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}/chat/completions", data=body, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(request, timeout=timeout) as resp:  # noqa: S310 - hospital-internal URL from config
        payload = json.loads(resp.read().decode("utf-8"))
    return parse_llm_fields(json.loads(payload["choices"][0]["message"]["content"]), sections)


def draft_protocol(
    sections: list[Section],
    source: str,
    planned_side: str | None,
    backend: str,
    llm: tuple[str, str, float] | None,
) -> tuple[list[FieldDraft], str]:
    """Drafts and checks every field. Returns (fields, engine name)."""
    drafts: list[FieldDraft] | None = None
    engine = "noteikumi (bez MI)"
    if backend == "llm" and llm:
        base_url, model, timeout = llm
        try:
            drafts, engine = llm_extract(sections, source, base_url, model, timeout), f"MI: {model}"
        except Exception as exc:  # noqa: BLE001 - the protocol still gets drafted
            log.warning("LLM protocol extraction failed (%s), falling back to rules", type(exc).__name__)
            engine = "noteikumi (MI nebija pieejams)"
    if drafts is None:
        drafts = rules_extract(sections, source)
    return [validate(d, source, planned_side) for d in drafts], engine


__all__ = ["BOTH", "FieldDraft", "Section", "draft_protocol", "parse_llm_fields", "rules_extract", "validate"]
