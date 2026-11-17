from diktomed_worker.asr import Segment, Word


def seg(text: str, start: float = 0.0, probs: dict[str, float] | None = None, **kw) -> Segment:
    """A segment whose words are spread 0.4 s apart, all confident unless overridden."""
    probs = probs or {}
    words = []
    t = start
    for token in text.split():
        words.append(Word(" " + token, round(t, 2), round(t + 0.35, 2), probs.get(token, 0.95)))
        t += 0.4
    return Segment(start=start, end=round(t, 2), text=text, words=words, avg_logprob=kw.get("avg_logprob", -0.1),
                   no_speech_prob=kw.get("no_speech_prob", 0.01), compression_ratio=kw.get("compression_ratio", 1.2))
