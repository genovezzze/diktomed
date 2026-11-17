"""Worker settings, read once from the environment."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

# Query parameters Prisma understands but libpq rejects.
_PRISMA_ONLY_PARAMS = {"schema", "connection_limit", "pool_timeout", "pgbouncer", "socket_timeout", "statement_cache_size"}


def libpq_url(url: str) -> str:
    """The same DATABASE_URL the web app uses, minus Prisma-only parameters."""
    parts = urlsplit(url)
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k not in _PRISMA_ONLY_PARAMS]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def _float(env: dict[str, str], key: str, default: float) -> float:
    raw = env.get(key)
    return float(raw) if raw not in (None, "") else default


def _int(env: dict[str, str], key: str, default: int) -> int:
    raw = env.get(key)
    return int(raw) if raw not in (None, "") else default


@dataclass(frozen=True)
class Settings:
    database_url: str
    storage_dir: Path
    asr_backend: str  # "faster-whisper" or "fake" (demo without a GPU or model)
    asr_model: str
    asr_device: str  # "auto", "cuda" or "cpu"
    asr_compute_type: str  # "auto", "int8", "int8_float16", "float16", ...
    asr_language: str | None  # "lv"; None lets the model detect it
    asr_beam_size: int
    audio_denoise: bool
    line_threshold: float
    word_threshold: float
    correction_min_count: int
    retention_days: int  # 0 keeps audio until deleted by hand
    poll_seconds: float
    max_attempts: int
    llm_base_url: str | None  # OpenAI-compatible server on the hospital LAN (Ollama, vLLM)
    llm_model: str | None
    llm_timeout: float
    protocol_backend: str  # "llm" or "rules"


def load_settings(env: dict[str, str] | None = None) -> Settings:
    env = dict(os.environ if env is None else env)
    database_url = env.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL is not set")
    language = (env.get("ASR_LANGUAGE") or "lv").strip().lower()
    llm_base_url = (env.get("LLM_BASE_URL") or "").strip().rstrip("/") or None
    return Settings(
        database_url=libpq_url(database_url),
        storage_dir=Path(env.get("STORAGE_DIR") or "./data").resolve(),
        asr_backend=(env.get("ASR_BACKEND") or "faster-whisper").strip().lower(),
        asr_model=env.get("ASR_MODEL") or "large-v3",
        asr_device=(env.get("ASR_DEVICE") or "auto").strip().lower(),
        asr_compute_type=(env.get("ASR_COMPUTE_TYPE") or "auto").strip().lower(),
        asr_language=None if language in ("", "auto") else language,
        asr_beam_size=_int(env, "ASR_BEAM_SIZE", 5),
        audio_denoise=(env.get("AUDIO_DENOISE") or "").lower() in ("1", "true", "yes"),
        line_threshold=_float(env, "LINE_THRESHOLD", 0.7),
        word_threshold=_float(env, "WORD_THRESHOLD", 0.5),
        correction_min_count=_int(env, "CORRECTION_MIN_COUNT", 2),
        retention_days=_int(env, "RETENTION_DAYS", 0),
        poll_seconds=_float(env, "POLL_SECONDS", 2.0),
        max_attempts=_int(env, "MAX_ATTEMPTS", 3),
        llm_base_url=llm_base_url,
        llm_model=(env.get("LLM_MODEL") or "").strip() or None,
        llm_timeout=_float(env, "LLM_TIMEOUT", 120.0),
        # With a local LLM configured the protocol uses it; otherwise keyword rules.
        protocol_backend=(env.get("PROTOCOL_BACKEND") or ("llm" if llm_base_url and env.get("LLM_MODEL") else "rules")).strip().lower(),
    )
