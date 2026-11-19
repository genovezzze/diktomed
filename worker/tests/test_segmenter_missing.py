import numpy as np

from diktomed_worker.asr import FasterWhisperTranscriber
from diktomed_worker.flags import build_flags, missing_speech_flags
from diktomed_worker.segmenter import SAMPLE_RATE, pieces
from tests.helpers import seg

rng = np.random.default_rng(0)


def recording(parts: list[tuple[str, float]]) -> np.ndarray:
    """'s' = muffled speech-like sound (500 Hz bursts), '-' = quiet background."""
    out = []
    for kind, seconds in parts:
        n = int(seconds * SAMPLE_RATE)
        noise = 0.003 * rng.standard_normal(n)
        if kind == "s":
            t = np.arange(n) / SAMPLE_RATE
            syllables = (np.sin(2 * np.pi * 4 * t) > -0.3).astype(float)  # 4 bursts a second, short gaps
            noise += 0.2 * np.sin(2 * np.pi * 500 * t) * syllables
        out.append(noise)
    return np.concatenate(out).astype(np.float32)


def seconds(p):
    return [(round(a / SAMPLE_RATE, 1), round(b / SAMPLE_RATE, 1)) for a, b in p]


def test_keeps_all_speech_and_drops_only_silence():
    audio = recording([("-", 2), ("s", 10), ("-", 5), ("s", 6), ("-", 2)])
    got = seconds(pieces(audio))
    assert len(got) == 2
    assert got[0][0] <= 2.0 and got[0][1] >= 12.0
    assert got[1][0] <= 17.0 and got[1][1] >= 23.0


def test_long_speech_is_cut_into_short_pieces_without_losing_any():
    audio = recording([("s", 65)])
    got = pieces(audio, max_seconds=20)
    assert all(b - a <= 20 * SAMPLE_RATE for a, b in got)
    assert got[0][0] == 0 and got[-1][1] == len(audio)
    assert all(got[i][1] == got[i + 1][0] for i in range(len(got) - 1))


def test_silence_only_gives_nothing():
    assert pieces(recording([("-", 10)])) == []


def test_speech_without_text_is_a_high_flag():
    segments = [seg("Operācija sākta", start=0.0)]
    flags = missing_speech_flags(segments, [(0.0, 1.0), (5.0, 15.0)])
    assert [(f.kind, f.severity, f.start, f.end, f.segment_index) for f in flags] == [("MISSING_SPEECH", "HIGH", 5.0, 15.0, 0)]


def test_a_line_with_too_few_words_for_its_length_is_flagged():
    sparse = seg("Šodien operācija", start=0.0)
    sparse.end = 30.0  # two words for 30 seconds: most of it is missing
    flags = missing_speech_flags([sparse], [(0.0, 30.0)])
    assert len(flags) == 1 and "par maz teksta" in flags[0].message


def test_no_flag_when_the_text_covers_the_speech():
    segments = [seg("Veikta laparoskopiska holecistektomija bez komplikācijām", start=0.0)]
    assert missing_speech_flags(segments, [(0.0, segments[0].end)]) == []


def test_nothing_recognised_at_all_still_flags():
    flags = build_flags([], 0.7, 0.5, [], speech=[(0.0, 30.0)])
    assert [(f.kind, f.segment_index) for f in flags] == [("MISSING_SPEECH", None)]


class _Piece:
    def __init__(self, start, end, text):
        self.start, self.end, self.text = start, end, text
        self.words = []
        self.avg_logprob, self.no_speech_prob, self.compression_ratio = -0.3, 0.1, 1.2


class _Info:
    language, language_probability = "lv", 0.9


class _Model:
    def __init__(self):
        self.calls = []

    def transcribe(self, audio, **kw):
        self.calls.append((len(audio) / SAMPLE_RATE, kw))
        return iter([_Piece(0.5, 2.0, "teksts")]), _Info()


def test_transcriber_decodes_every_piece_and_never_skips_no_speech(tmp_path):
    import wave

    audio = recording([("-", 1), ("s", 45), ("-", 3), ("s", 5)])
    path = tmp_path / "a.wav"
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())

    t = FasterWhisperTranscriber.__new__(FasterWhisperTranscriber)
    t._model, t.language, t.beam_size, t.chunk_seconds, t.name = _Model(), "lv", 5, 20.0, "test"
    result = t.transcribe(path, None)

    calls = t._model.calls
    assert len(calls) == len(result.speech) >= 4  # 45 s -> 3 pieces, plus the last 5 s
    assert all(seconds_ <= 20.01 for seconds_, _ in calls)
    assert all(kw["no_speech_threshold"] is None and kw["vad_filter"] is False for _, kw in calls)
    # Timestamps are moved back to the position in the whole recording.
    assert result.segments[1].start > result.segments[0].start
    assert abs(sum(b - a for a, b in result.speech) - 50) < 2
