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
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Protocol

from .audio import SAMPLE_RATE, wav_duration
from .segmenter import pieces as segment_pieces

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
    # Where the voice detector heard speech (seconds). Speech with no text
    # under it is flagged, so nothing the doctor said disappears unnoticed.
    speech: list[tuple[float, float]] = field(default_factory=list)


ProgressCallback = Callable[[float], None]


class Transcriber(Protocol):
    name: str

    def transcribe(self, path: Path, initial_prompt: str | None, on_progress: ProgressCallback | None = None) -> Transcript: ...


def read_wav_float32(path: Path):
    """The normalised 16 kHz mono PCM WAV as float32 samples in [-1, 1].

    Handing faster-whisper the samples instead of a file path keeps it from
    decoding audio itself through PyAV, whose API changes between releases
    (PyAV 15+ dropped an argument faster-whisper passes). ffmpeg has already
    produced exactly the format the model wants.
    """
    import wave

    import numpy as np  # noqa: PLC0415 - comes with faster-whisper

    with wave.open(str(path), "rb") as w:
        if w.getsampwidth() != 2 or w.getnchannels() != 1:
            raise ValueError("expected 16-bit mono PCM WAV")
        frames = w.readframes(w.getnframes())
    return np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0


class FasterWhisperTranscriber:
    """Whisper through CTranslate2. Point ASR_MODEL at a converted model folder,
    e.g. the AiLab (LU MII) Latvian fine-tune converted with
    scripts/download_model.sh, so nothing is fetched at runtime."""

    def __init__(
        self, model: str, device: str, compute_type: str, language: str | None, beam_size: int, chunk_seconds: float = 20.0
    ):
        import ctranslate2  # noqa: PLC0415 - heavy import, only when used
        from faster_whisper import WhisperModel  # noqa: PLC0415

        if device == "auto":
            device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
        if compute_type == "auto":
            compute_type = "int8_float16" if device == "cuda" else "int8"
        self.language = language
        self.beam_size = beam_size
        self.chunk_seconds = chunk_seconds
        self.name = f"{Path(model).name} ({device}/{compute_type})"
        log.info("Loading model %s", self.name)
        self._model = WhisperModel(model, device=device, compute_type=compute_type)

    def transcribe(self, path: Path, initial_prompt: str | None, on_progress: ProgressCallback | None = None) -> Transcript:
        """Recognises everything louder than the background, one short piece at a time.

        Two ways a dictation used to lose minutes without a trace on muffled
        audio: faster-whisper's neural voice detector did not hear the speech
        at all, and Whisper judged whole windows "no speech" and dropped them.
        Now loudness decides what is sound (segmenter.py), pieces are short,
        the no-speech skip is off, and the pieces are reported back so speech
        without text gets a flag.
        """
        audio = read_wav_float32(path)
        total = len(audio)
        chunks = [{"start": a, "end": b} for a, b in segment_pieces(audio, self.chunk_seconds)]
        segments: list[Segment] = []
        speech: list[tuple[float, float]] = []
        language, language_prob = self.language, None
        for n, chunk in enumerate(chunks):
            offset = chunk["start"] / SAMPLE_RATE
            speech.append((round(offset, 2), round(chunk["end"] / SAMPLE_RATE, 2)))
            pieces, info = self._model.transcribe(
                audio[chunk["start"] : chunk["end"]],
                language=self.language,
                beam_size=self.beam_size,
                word_timestamps=True,
                vad_filter=False,
                # Never drop a piece as "no speech": there is sound here.
                # Doubtful text is flagged for a person instead.
                no_speech_threshold=None,
                # Not feeding the previous text back stops repetition loops.
                condition_on_previous_text=False,
                initial_prompt=initial_prompt,
                temperature=(0.0, 0.2, 0.4, 0.6),
            )
            if n == 0:
                language, language_prob = info.language, float(info.language_probability)
            for p in pieces:
                words = [Word(w.word, round(offset + w.start, 2), round(offset + w.end, 2), float(w.probability)) for w in (p.words or [])]
                segments.append(
                    Segment(
                        start=round(offset + p.start, 2),
                        end=round(offset + p.end, 2),
                        text=p.text,
                        words=words,
                        avg_logprob=float(p.avg_logprob),
                        no_speech_prob=float(p.no_speech_prob),
                        compression_ratio=float(p.compression_ratio),
                    )
                )
            if on_progress and total:
                on_progress(min(0.99, chunk["end"] / total))
        return Transcript(
            segments=segments,
            language=language,
            language_prob=language_prob,
            duration=total / SAMPLE_RATE,
            model_name=self.name,
            speech=speech,
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
        return Transcript(
            segments=segments,
            language="lv",
            language_prob=0.97,
            duration=duration,
            model_name=self.name,
            speech=[(s.start, s.end) for s in segments],
        )


def make_transcriber(settings) -> Transcriber:
    if settings.asr_backend == "fake":
        log.warning("ASR_BACKEND=fake: producing a fictional demo dictation, not real recognition")
        return FakeTranscriber()
    if settings.asr_backend == "faster-whisper":
        return FasterWhisperTranscriber(
            settings.asr_model,
            settings.asr_device,
            settings.asr_compute_type,
            settings.asr_language,
            settings.asr_beam_size,
            settings.asr_chunk_seconds,
        )
    raise SystemExit(f"Unknown ASR_BACKEND: {settings.asr_backend}")
