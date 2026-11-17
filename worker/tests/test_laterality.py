from diktomed_worker.flags import side_flags
from diktomed_worker.laterality import LEFT, RIGHT, find_sides
from tests.helpers import seg


def test_left_is_always_a_side():
    assert [m.side for m in find_sides("Kreisā ceļa locītavas artroskopija.".split())] == [LEFT]


def test_right_needs_a_body_part_because_laba_also_means_good():
    assert find_sides("Pacients labā stāvoklī.".split()) == []
    assert [m.side for m in find_sides("Labā ceļa locītavā izsvīdums.".split())] == [RIGHT]
    assert [m.side for m in find_sides("Trokārs ievadīts labajā pusē.".split())] == [RIGHT]


def test_mismatch_with_planned_side_is_high():
    segments = [seg("Kreisā ceļa artroskopija.", 0), seg("Labā ceļa locītavā izsvīdums nav.", 5)]
    flags = side_flags(segments, LEFT)
    assert [(f.kind, f.severity, f.excerpt) for f in flags] == [("SIDE_MISMATCH", "HIGH", "Labā ceļa")]
    assert flags[0].start == segments[1].words[0].start


def test_planned_side_never_mentioned_is_info():
    flags = side_flags([seg("Veikta apendektomija.")], RIGHT)
    assert [(f.kind, f.severity) for f in flags] == [("SIDE_MISMATCH", "INFO")]


def test_without_plan_both_sides_mentioned_is_medium():
    flags = side_flags([seg("Kreisā ceļa artroskopija."), seg("Labā ceļa locītava vesela.", 5)], None)
    assert [f.severity for f in flags] == ["MEDIUM", "MEDIUM"]


def test_both_planned_is_quiet():
    assert side_flags([seg("Kreisā ceļa un labā ceļa artroskopija.")], "BOTH") == []
