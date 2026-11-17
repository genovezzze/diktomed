from diktomed_worker.llm import filter_suggestions

TEXTS = ["Veikta daļēja meniskektomija ar šeiveri.", "Ketonāls 100 mg."]


def test_keeps_small_fix_pointing_at_real_text():
    raw = {"suggestions": [{"line": 0, "original": "šeiveri", "replacement": "šeiveru", "reason": "instruments"}]}
    out = filter_suggestions(raw, TEXTS)
    assert [(s.line, s.original, s.replacement) for s in out] == [(0, "šeiveri", "šeiveru")]


def test_drops_invented_text_rewrites_and_numbers():
    raw = {
        "suggestions": [
            {"line": 0, "original": "nav tekstā", "replacement": "x"},
            {"line": 0, "original": "Veikta daļēja meniskektomija ar šeiveri.", "replacement": "Pilnīgi cits teksts ar daudz vārdiem"},
            {"line": 1, "original": "100", "replacement": "1000"},
            {"line": 5, "original": "a", "replacement": "b"},
            "nonsense",
        ]
    }
    assert filter_suggestions(raw, TEXTS) == []


def test_malformed_payload():
    assert filter_suggestions(None, TEXTS) == []
    assert filter_suggestions({"suggestions": "x"}, TEXTS) == []
