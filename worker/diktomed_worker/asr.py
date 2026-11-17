"""Speech recognition backends.

faster-whisper runs the model on the hospital's own GPU or CPU: the audio
never leaves the server. The fake backend produces a fixed, fictional
dictation so the whole product can be demonstrated and tested without a GPU,
a model download or any real recording.
"""

from __future__ import annotations

import hashlib
import logging
import math
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Protocol

from .audio import wav_duration

log = logging.getLogger(__name__)


@dataclass
class Word:
    text: str  # as the model emits it, usually with a leading space
    start: float
    end: float
    prob: float


@dataclass
class Segment:
    start: float
    end: float
    text: str
    words: list[Word] = field(default_factory=list)
    avg_logprob: float | None = None
    no_speech_prob: float | None = None
    compression_ratio: float | None = None

    @property
    def confidence(self) -> float:
        """Mean word probability; falls back to exp(avg_logprob)."""
        if self.words:
            return sum(w.prob for w in self.words) / len(self.words)
        if self.avg_logprob is not None:
            return max(0.0, min(1.0, math.exp(self.avg_logprob)))
        return 0.0


@dataclass
class Transcript:
    segments: list[Segment]
    language: str | None
    language_prob: float | None
    duration: float
    model_name: str


ProgressCallback = Callable[[float], None]


class Transcriber(Protocol):
    name: str

    def transcribe(self, path: Path, initial_prompt: str | None, on_progress: ProgressCallback | None = None) -> Transcript: ...


class FasterWhisperTranscriber:
    """Whisper through CTranslate2. Point ASR_MODEL at a converted model folder,
    e.g. the AiLab (LU MII) Latvian fine-tune converted with
    scripts/download_model.sh, so nothing is fetched at runtime."""

    def __init__(self, model: str, device: str, compute_type: str, language: str | None, beam_size: int):
        import ctranslate2  # noqa: PLC0415 - heavy import, only when used
        from faster_whisper import WhisperModel  # noqa: PLC0415

        if device == "auto":
            device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
        if compute_type == "auto":
            compute_type = "int8_float16" if device == "cuda" else "int8"
        self.language = language
        self.beam_size = beam_size
        self.name = f"{Path(model).name} ({device}/{compute_type})"
        log.info("Loading model %s", self.name)
        self._model = WhisperModel(model, device=device, compute_type=compute_type)

    def transcribe(self, path: Path, initial_prompt: str | None, on_progress: ProgressCallback | None = None) -> Transcript:
        segments_iter, info = self._model.transcribe(
            str(path),
            language=self.language,
            beam_size=self.beam_size,
            word_timestamps=True,
            # Silence is where Whisper invents text; the VAD cuts it out first.
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
            # Not feeding the previous text back stops repetition loops.
            condition_on_previous_text=False,
            initial_prompt=initial_prompt,
            temperature=(0.0, 0.2, 0.4, 0.6),
        )
        segments: list[Segment] = []
        last_report = 0.0
        for s in segments_iter:
            # Segments arrive as they are decoded: report how far into the audio we are.
            if on_progress and info.duration > 0 and time.monotonic() - last_report > 2:
                on_progress(min(0.99, float(s.end) / float(info.duration)))
                last_report = time.monotonic()
            words = [Word(w.word, float(w.start), float(w.end), float(w.probability)) for w in (s.words or [])]
            segments.append(
                Segment(
                    start=float(s.start),
                    end=float(s.end),
                    text=s.text,
                    words=words,
                    avg_logprob=float(s.avg_logprob),
                    no_speech_prob=float(s.no_speech_prob),
                    compression_ratio=float(s.compression_ratio),
                )
            )
        return Transcript(
            segments=segments,
            language=info.language,
            language_prob=float(info.language_probability),
            duration=float(info.duration),
            model_name=self.name,
        )


# A fictional protocol of a left knee arthroscopy. Words listed in the
# overrides come out with low confidence, one line names the wrong side, the
# last line is a typical Whisper hallucination: every kind of review flag
# shows up in a demo. No real patient or recording is behind any of it.
_FAKE_SCRIPT: list[tuple[str, dict[str, float], dict[str, float]]] = [
    ("Operācijas protokols. Kreisā ceļa locītavas artroskopija.", {}, {}),
    ("Pacients, piecdesmit četrus gadus vecs vīrietis, diagnoze mediālā menisku plīsums.", {"menisku": 0.58}, {}),
    ("Operācija veikta spinālajā anestēzijā, uzlikts turnikets.", {}, {"pause": 2.4}),
    ("Ievadīti divi artroskopiskie porti, anterolaterālais un anteromediālais.", {"anterolaterālais": 0.63}, {}),
    ("Konstatēts mediālā meniska aizmugurējā raga plīsums, skrimšļa bojājums otrās pakāpes.", {}, {}),
    ("Veikta daļēja meniskektomija ar šeiveri.", {"šeiveri.": 0.31}, {"pause": 2.2}),
    ("Jā, lūdzu, padodiet koagulātoru.", {"koagulātoru.": 0.61}, {}),
    ("Hemostāze, locītava izskalota ar fizioloģisko šķīdumu.", {}, {}),
    ("Motors.", {"Motors.": 0.42}, {"no_speech": 0.45, "logprob": -1.2}),
    ("Labā ceļa locītavā izsvīdums netika konstatēts.", {}, {"pause": 2.6}),
    ("Asins zudums minimāls, ap divdesmit mililitriem.", {}, {}),
    ("Brūces sašūtas, aseptisks pārsējs, elastīgā saite.", {"elastīgā": 0.47}, {"pause": 2.1}),
    ("Pēc operācijas ketonāls simts miligrami intravenozi.", {"ketonāls": 0.52}, {}),
    ("Paldies par skatīšanos!", {"Paldies": 0.47, "par": 0.5, "skatīšanos!": 0.38}, {"no_speech": 0.82, "logprob": -1.35}),
]


def _stable_prob(seed: str) -> float:
    """Deterministic 'confident' probability in [0.86, 0.995]."""
    h = int(hashlib.sha1(seed.encode("utf-8")).hexdigest()[:8], 16)
    return 0.86 + (h % 1350) / 10_000


class FakeTranscriber:
    name = "demo (bez modeļa)"

    def transcribe(self, path: Path, initial_prompt: str | None, on_progress: ProgressCallback | None = None) -> Transcript:
        duration = wav_duration(path)
        if on_progress:
            on_progress(0.5)
        pauses = sum(extra.get("pause", 0.6) for _, _, extra in _FAKE_SCRIPT)
        total_words = sum(len(text.split()) for text, _, _ in _FAKE_SCRIPT)
        speech_time = max(duration - pauses - 1.0, total_words * 0.12)
        per_word = speech_time / total_words

        t = 0.5
        segments: list[Segment] = []
        for i, (text, overrides, extra) in enumerate(_FAKE_SCRIPT):
            words: list[Word] = []
            for j, token in enumerate(text.split()):
                start = t
                end = t + per_word * (0.85 + 0.1 * (len(token) % 4))
                prob = overrides.get(token, _stable_prob(f"{i}:{j}:{token}"))
                words.append(Word(" " + token, round(start, 2), round(end, 2), round(prob, 3)))
                t = end + per_word * 0.12
            conf = sum(w.prob for w in words) / len(words)
            segments.append(
                Segment(
                    start=words[0].start,
                    end=words[-1].end,
                    text=text,
                    words=words,
                    avg_logprob=extra.get("logprob", math.log(conf)),
                    no_speech_prob=extra.get("no_speech", 0.02),
                    compression_ratio=1.3,
                )
            )
            t += extra.get("pause", 0.6)

        # Scale onto the real duration so the waveform and timestamps line up.
        last_end = segments[-1].end
        if last_end > duration > 0:
            k = (duration - 0.2) / last_end
            for s in segments:
                s.start, s.end = round(s.start * k, 2), round(s.end * k, 2)
                for w in s.words:
                    w.start, w.end = round(w.start * k, 2), round(w.end * k, 2)
        return Transcript(segments=segments, language="lv", language_prob=0.97, duration=duration, model_name=self.name)


def make_transcriber(settings) -> Transcriber:
    if settings.asr_backend == "fake":
        log.warning("ASR_BACKEND=fake: producing a fictional demo dictation, not real recognition")
        return FakeTranscriber()
    if settings.asr_backend == "faster-whisper":
        return FasterWhisperTranscriber(
            settings.asr_model, settings.asr_device, settings.asr_compute_type, settings.asr_language, settings.asr_beam_size
        )
    raise SystemExit(f"Unknown ASR_BACKEND: {settings.asr_backend}")
