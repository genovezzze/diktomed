"""Optional second opinion from a local language model.

Off unless LLM_BASE_URL points at an OpenAI-compatible server on the hospital
network (Ollama, vLLM, llama.cpp server). The model only proposes; its
proposals become review flags and are accepted or rejected by a person.
Any failure here is logged and ignored: the draft is produced without it.
"""

from __future__ import annotations

import json
import logging
import urllib.request
from dataclasses import dataclass

from .flags import MEDIUM, FlagDraft, _time_for_chars, segment_text
from .asr import Segment

log = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "Tu esi medicīniskās dokumentācijas korektors latviešu valodā. Tev dots runas atpazīšanas "
    "melnraksts no ārsta diktāta, sadalīts numurētās rindās. Atrodi tikai acīmredzamas "
    "atpazīšanas kļūdas: nepareizi sadzirdētus medicīniskos terminus, medikamentu nosaukumus, "
    "gramatiski neiespējamas vārdu formas. Neizdomā saturu, nemaini skaitļus, nepārfrāzē. "
    "Ja nav pārliecības, neko neiesaki. Atbildi tikai ar JSON: "
    '{"suggestions":[{"line":<rindas numurs>,"original":"<precīzs fragments no rindas>",'
    '"replacement":"<labojums>","reason":"<īss iemesls>"}]}'
)


@dataclass(frozen=True)
class Suggestion:
    line: int
    original: str
    replacement: str
    reason: str


def filter_suggestions(raw: object, texts: list[str]) -> list[Suggestion]:
    """Keeps only proposals that point at text that is really there and are
    small, local fixes. Anything else is the model rewriting, and is dropped."""
    if not isinstance(raw, dict) or not isinstance(raw.get("suggestions"), list):
        return []
    out: list[Suggestion] = []
    for item in raw["suggestions"]:
        if not isinstance(item, dict):
            continue
        line, original, replacement = item.get("line"), item.get("original"), item.get("replacement")
        reason = item.get("reason") if isinstance(item.get("reason"), str) else ""
        if not isinstance(line, int) or not isinstance(original, str) or not isinstance(replacement, str):
            continue
        if not (0 <= line < len(texts)):
            continue
        original, replacement = original.strip(), replacement.strip()
        if not original or original == replacement or original not in texts[line]:
            continue
        if len(original.split()) > 4 or len(replacement.split()) > 4 or len(replacement) > 60:
            continue
        if any(ch.isdigit() for ch in original + replacement):
            continue  # numbers are checked against the audio, never "corrected"
        out.append(Suggestion(line, original, replacement, reason[:160]))
    return out


def suggest(segments: list[Segment], base_url: str, model: str, timeout: float) -> list[FlagDraft]:
    texts = [segment_text(s) for s in segments]
    numbered = "\n".join(f"{i}: {t}" for i, t in enumerate(texts) if t)
    body = json.dumps(
        {
            "model": model,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": numbered},
            ],
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}/chat/completions", data=body, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:  # noqa: S310 - hospital-internal URL from config
            payload = json.loads(resp.read().decode("utf-8"))
        content = payload["choices"][0]["message"]["content"]
        raw = json.loads(content)
    except Exception as exc:  # noqa: BLE001 - optional step, never fails the job
        log.warning("LLM suggestions skipped: %s", type(exc).__name__)
        return []

    flags: list[FlagDraft] = []
    for s in filter_suggestions(raw, texts):
        seg = segments[s.line]
        start = texts[s.line].index(s.original)
        t0, t1 = _time_for_chars(seg, start, start + len(s.original))
        reason = f" {s.reason}" if s.reason else ""
        flags.append(
            FlagDraft(
                "AI_SUGGESTION",
                MEDIUM,
                s.line,
                t0,
                t1,
                f"MI iesaka «{s.original}» → «{s.replacement}».{reason}",
                excerpt=s.original,
                suggestion=s.replacement,
            )
        )
    return flags
