"""Structured document (operation protocol or epicrisis) from an APPROVED transcript.

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
_DRUG = r"(\bmg\b|miligram|\bg\b|gram|\bml\b|vienīb|\bSV\b|i/v|intravenoz|perorāl|antibiotik|cefazolīn|cefuroksīm|ceftriakson|metronidazol|ciprofloksacīn|amoksicilīn|heparīn|fraksiparīn|tranekscām)"
_RULES: dict[str, re.Pattern[str]] = {
    # --- operation protocol
    "diagnoze": re.compile(r"diagno[zs]", re.I),
    "operacija": re.compile(r"(skopij|ektomij|tomij|plastik|osteosintēz|rezekcij|endoprotez)", re.I),
    "anestezija": re.compile(r"(anestēzij|narkoz)", re.I),
    "gaita": re.compile(r"(ievadīt|veikt[as]?\b|izdalīt|izskalot|sašūt|uzlikt|evakuēt|klipsēt|pārgriezt|griezum|hemostāz)", re.I),
    "medikamenti": re.compile(_DRUG, re.I),
    "materiali": re.compile(r"(diegs|diegi|diegu|šuvju materiāl|vicryl|vikril|prolen|monocryl|monokril|pds\b|implant|siet[su]?\b|klips|klipš|skavas|stent|endoprotēz|plāksn|skrūv)", re.I),
    "atradne": re.compile(r"(konstatē|redzam|atrast|palielināt|sabiezēt|izsvīdum)", re.I),
    "asins_zudums": re.compile(r"asins zudum", re.I),
    "drenaza": re.compile(r"drenāž", re.I),
    "komplikacijas": re.compile(r"komplikācij", re.I),
    "histologija": re.compile(r"histolo", re.I),
    "nozimejumi": re.compile(r"(pēc operācijas|nozīm)", re.I),
    # --- epicrisis
    "ep_pamatdiagnoze": re.compile(r"(diagno[zs]|\b[A-TV-Z]\d{2}(\.\d{1,2})?\b)", re.I),
    "ep_blakusdiagnozes": re.compile(r"(blakus|pavadoš|cukura diabēt|diabēt|hipertensij|hipertonij|sirds mazspēj|išēmisk|mirdzaritmij|astm|HOPS|nieru mazspēj|aptaukošan|hipotireoz)", re.I),
    "ep_alergijas": re.compile(r"(alerģ|nepanes)", re.I),
    "ep_sudzibas": re.compile(r"(sūdz|stacionēt|iestājās|iestājies|atvest|vērsās|uzņemt|sāpes|sāpēm)", re.I),
    "ep_izmeklejumi": re.compile(r"(datortomogr|\bDT\b|USG|ultrason|rentgen|\bMR\b|magnētisk|analīz|leikocīt|CRO|C reaktīv|hemoglobīn|kreatinīn|EKG|skopij|uzsējum|biopsij)", re.I),
    "ep_rekomendacijas": re.compile(r"(rekomend|\blietot|ieteicam|ieteikt|turpināt|ģimenes ārst|kontrol|vizīt|ierasties|ambulator|izrakst)", re.I),
    "ep_arstesana": re.compile(r"(ārstēt|ārstēšan|saņēm|ordinēt|ievadīt|uzsākt|sākt|antibiotik|operēt|operācij|veikta|veikts|drenēt)" + "|" + _DRUG, re.I),
    "ep_gaita": re.compile(r"(stāvoklis|uzlabojās|pasliktinājās|dinamik|gaita|norisināj|stabil)", re.I),
}

# Rules mode places a sentence in one section only, deciding in this order:
# the more specific a section, the earlier it picks. Sections not listed
# (added by the hospital) come last.
_ORDER = {
    "OPERATION": ["diagnoze", "anestezija", "drenaza", "asins_zudums", "komplikacijas", "histologija", "nozimejumi",
                  "materiali", "medikamenti", "operacija", "atradne", "gaita"],
    "EPICRISIS": ["ep_alergijas", "ep_rekomendacijas", "ep_blakusdiagnozes", "ep_pamatdiagnoze", "ep_izmeklejumi",
                  "ep_sudzibas", "ep_arstesana", "ep_gaita"],
}
# Sections that may share a sentence with others: the operation's name also
# says what was found or done.
_SHARED = {"diagnoze", "operacija"}


# A spoken heading is a sentence that is only a section name ("Diagnoze.",
# "Rekomendācijas:"). Spelling variants the recogniser produces are included.
_HEADINGS: dict[str, re.Pattern[str]] = {
    key: re.compile(rf"^\W*(?:{pattern})\W*$", re.I)
    for key, pattern in {
        "diagnoze": r"(pēcoperācijas |pirmsoperācijas )?diagno[zs]\w*",
        "operacija": r"operācija|operācijas nosaukums",
        "anestezija": r"anestēzija|narkoze",
        "gaita": r"operācijas gaita|gaita",
        "medikamenti": r"medikamenti|ievadītie medikamenti",
        "materiali": r"materiāli|implanti|materiāli un implanti",
        "atradne": r"atradne",
        "asins_zudums": r"asins zudums",
        "drenaza": r"drenāža",
        "komplikacijas": r"komplikācijas",
        "histologija": r"histoloģija",
        "nozimejumi": r"nozīmējumi|pēcoperācijas nozīmējumi",
        "ep_pamatdiagnoze": r"(pamat|galvenā )?diagno[zs]\w*",
        "ep_blakusdiagnozes": r"blakus\s?(diagno[zs]\w*|slimības)",
        "ep_alergijas": r"alerģijas|alerģija",
        "ep_sudzibas": r"sūdzības|anamnēze",
        "ep_gaita": r"slimības gaita|gaita",
        "ep_izmeklejumi": r"izmeklējumi|izmeklējumu rezultāti",
        "ep_arstesana": r"ārstēšana|ārstēšanās|terapija",
        "ep_rekomendacijas": r"rekomendācijas|ieteikumi",
    }.items()
}
HEADING_SPAN = 4  # sentences a spoken heading carries at most


def _headed(sentences: list[str], sections: list[Section]) -> dict[str, list[str]]:
    """Doctors often dictate a heading first: "Diagnoze." then the diagnosis.
    The sentences after a heading belong to its section, up to the next
    heading (one sentence for a single-value section)."""
    out: dict[str, list[str]] = {}
    current: Section | None = None
    left = 0
    for sentence in sentences:
        heading = next((sec for sec in sections if (h := _HEADINGS.get(sec.key)) and h.match(sentence)), None)
        if heading:
            current, left = heading, (HEADING_SPAN if heading.multi else 1)
            continue
        if current and left > 0:
            out.setdefault(current.key, []).append(sentence)
            left -= 1
    return out


def rules_extract(sections: list[Section], source: str, kind: str = "OPERATION") -> list[FieldDraft]:
    sentences = [s.strip() for s in _SENTENCE.split(" ".join(source.split())) if s.strip()]
    order = _ORDER.get(kind, [])
    ranked = sorted(sections, key=lambda s: (order.index(s.key) if s.key in order else len(order), s.position))
    # Sentences under a spoken heading go to that section first.
    taken: dict[str, list[str]] = _headed(sentences, sections)
    headings = {x for x in sentences if any((h := _HEADINGS.get(sec.key)) and h.match(x) for sec in sections)}
    used: set[str] = {q for quotes in taken.values() for q in quotes} | headings
    for section in ranked:
        headed = taken.get(section.key, [])
        if headed and not section.multi:
            continue
        rule = _RULES.get(section.key)
        if rule is None:
            taken[section.key] = headed
            continue
        hits = [s for s in sentences if rule.search(s) and s not in headings and (section.key in _SHARED or s not in used)]
        if section.key == "ep_pamatdiagnoze":
            # The main diagnosis is the first one named; the others are secondary.
            hits = [s for s in hits if s not in used]
        hits = hits if section.multi else hits[:1]
        # Under a heading and elsewhere in the dictation: both, in text order.
        hits = [x for x in sentences if x in headed or x in hits]
        taken[section.key] = hits
        if section.key not in _SHARED:
            used.update(hits)

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

DOCUMENT_LV = {"OPERATION": "operācijas protokola", "EPICRISIS": "epikrīzes"}

SYSTEM_PROMPT = (
    "Tu aizpildi {document} laukus latviešu valodā TIKAI no dotā apstiprinātā "
    "diktāta teksta. Katram laukam atgriez \"value\" (īss, protokolam piemērots teksts) un "
    "\"quotes\" - precīzus, burtiskus fragmentus no teksta, uz kuriem vērtība balstās. "
    "Ja tekstā informācijas nav, \"value\": null un \"quotes\": []. Nepievieno faktus, kuru "
    "tekstā nav. Skaitļus, devas un pusi (kreisā/labā) nemaini un neizdomā. "
    "Ārsts var lēkāt pa tēmām un vēlāk papildināt iepriekš teikto: ņem vērā visu tekstu. "
    "Diagnozes nesaki pats: ja ārsts nosauc vairākas, galvenā ir tā, ko viņš sauc par galveno "
    "(vai pirmā), pārējās ir blakusdiagnozes. SSK-10 kodus raksti tikai tad, ja tie pateikti. "
    "Atbildi tikai ar JSON: {{\"fields\":[{{\"key\":\"...\",\"value\":...,\"quotes\":[...]}}]}}"
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


def llm_extract(
    sections: list[Section], source: str, base_url: str, model: str, timeout: float, kind: str = "OPERATION"
) -> list[FieldDraft]:
    body = json.dumps(
        {
            "model": model,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT.format(document=DOCUMENT_LV.get(kind, DOCUMENT_LV["OPERATION"]))},
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
    kind: str = "OPERATION",
) -> tuple[list[FieldDraft], str]:
    """Drafts and checks every field. Returns (fields, engine name)."""
    drafts: list[FieldDraft] | None = None
    engine = "noteikumi (bez MI)"
    if backend == "llm" and llm:
        base_url, model, timeout = llm
        try:
            drafts, engine = llm_extract(sections, source, base_url, model, timeout, kind), f"MI: {model}"
        except Exception as exc:  # noqa: BLE001 - the protocol still gets drafted
            log.warning("LLM protocol extraction failed (%s), falling back to rules", type(exc).__name__)
            engine = "noteikumi (MI nebija pieejams)"
    if drafts is None:
        drafts = rules_extract(sections, source, kind)
    return [validate(d, source, planned_side) for d in drafts], engine


__all__ = ["BOTH", "FieldDraft", "Section", "draft_protocol", "parse_llm_fields", "rules_extract", "validate"]
