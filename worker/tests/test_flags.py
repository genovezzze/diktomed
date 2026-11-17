from diktomed_worker.flags import Correction, build_flags
from tests.helpers import seg


def kinds(flags):
    return [(f.kind, f.severity) for f in flags]


def test_clean_line_has_no_flags():
    assert build_flags([seg("Veiksim hemostāzi.")], 0.7, 0.5, []) == []


def test_known_hallucination_phrase_is_high_and_proposes_deletion():
    flags = build_flags([seg("Paldies par skatīšanos!")], 0.7, 0.5, [])
    assert kinds(flags) == [("POSSIBLE_HALLUCINATION", "HIGH")]
    assert flags[0].suggestion == ""
    assert flags[0].excerpt == "Paldies par skatīšanos!"


def test_single_unsure_word_line_is_hallucination():
    flags = build_flags([seg("Motors.", probs={"Motors.": 0.42})], 0.7, 0.5, [])
    assert kinds(flags) == [("POSSIBLE_HALLUCINATION", "HIGH")]


def test_silence_with_text_is_hallucination():
    flags = build_flags([seg("Kaut kas tika teikts", no_speech_prob=0.8, avg_logprob=-1.2)], 0.7, 0.5, [])
    assert kinds(flags) == [("POSSIBLE_HALLUCINATION", "HIGH")]


def test_repeated_line_is_hallucination():
    s1 = seg("Brūces sašūtas aseptisks pārsējs.", 0)
    s2 = seg("Brūces sašūtas aseptisks pārsējs.", 3)
    assert kinds(build_flags([s1, s2], 0.7, 0.5, [])) == [("POSSIBLE_HALLUCINATION", "HIGH")]


def test_low_confidence_line_severity():
    medium = seg("Viens divi trīs četri", probs={"Viens": 0.6, "divi": 0.6, "trīs": 0.6, "četri": 0.6})
    flags = [f for f in build_flags([medium], 0.7, 0.5, []) if f.kind == "LOW_CONFIDENCE_LINE"]
    assert [f.severity for f in flags] == ["MEDIUM"]


def test_unclear_words_are_grouped_with_timing():
    s = seg("Veikta daļēja meniskektomija ar šeiveri.", probs={"ar": 0.4, "šeiveri.": 0.3})
    flags = [f for f in build_flags([s], 0.5, 0.5, []) if f.kind == "LOW_CONFIDENCE_WORD"]
    assert len(flags) == 1
    assert flags[0].excerpt == "ar šeiveri."
    assert flags[0].start == s.words[3].start and flags[0].end == s.words[4].end


def test_numbers_with_units_are_medium_without_units_info():
    flags = build_flags([seg("Asins zudums ap piecdesmit mililitriem. Pacients piecdesmit gadus.")], 0.7, 0.5, [])
    numbers = [(f.severity, f.excerpt) for f in flags if f.kind == "NUMBER"]
    assert numbers == [("MEDIUM", "piecdesmit mililitriem"), ("INFO", "piecdesmit")]


def test_digit_dose():
    flags = build_flags([seg("Ketonāls 100 mg intravenozi.")], 0.7, 0.5, [])
    assert [(f.severity, f.excerpt) for f in flags if f.kind == "NUMBER"] == [("MEDIUM", "100 mg")]


def test_learned_correction_becomes_suggestion():
    corrections = [Correction("koagulātoru", "koagulatoru", 3)]
    flags = build_flags([seg("Jā, lūdzu, padodiet koagulātoru.")], 0.7, 0.5, corrections)
    term = [f for f in flags if f.kind == "TERM"]
    assert len(term) == 1
    assert term[0].excerpt == "koagulātoru"
    assert term[0].suggestion == "koagulatoru"
    assert "3×" in term[0].message


def test_correction_matches_whole_words_only():
    corrections = [Correction("ret", "rēta", 5)]
    flags = build_flags([seg("Konstatēts retrogrāds plūsmas virziens.")], 0.7, 0.5, corrections)
    assert not [f for f in flags if f.kind == "TERM"]


def test_flags_are_sorted_by_time():
    a = seg("Paldies par skatīšanos!", 10)
    b = seg("Ketonāls 100 mg.", 0)
    flags = build_flags([b, a], 0.7, 0.5, [])
    assert [f.start for f in flags] == sorted(f.start for f in flags)


def test_side_and_number_corrections_are_never_suggested():
    corrections = [Correction("labā", "Kreisā", 9), Correction("simts", "piecdesmit", 9)]
    flags = build_flags([seg("Labā ceļa locītava. Ketonāls simts miligrami.")], 0.7, 0.5, corrections)
    assert not [f for f in flags if f.kind == "TERM"]
