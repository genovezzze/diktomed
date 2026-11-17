from diktomed_worker.numbers_lv import parse_numbers
from diktomed_worker.protocol import (
    EMPTY, NO_QUOTE, NUMBER_MISMATCH, OK, QUOTE_NOT_FOUND, SIDE_MISMATCH,
    FieldDraft, Section, draft_protocol, parse_llm_fields, rules_extract, validate,
)

SOURCE = (
    "Operācijas protokols. Kreisā ceļa locītavas artroskopija. Pacients, piecdesmit četrus gadus vecs vīrietis, "
    "diagnoze mediālā meniska plīsums. Operācija veikta spinālajā anestēzijā, uzlikts turnikets.\n\n"
    "Ievadīti divi artroskopiskie porti. Konstatēts mediālā meniska aizmugurējā raga plīsums. "
    "Veikta daļēja meniskektomija ar šeiveri. Hemostāze, locītava izskalota ar fizioloģisko šķīdumu. "
    "Kreisā ceļa locītavā izsvīdums netika konstatēts. Asins zudums minimāls, ap divdesmit mililitriem. "
    "Drenāža netika ievietota. Brūces sašūtas. Pēc operācijas ketonāls simts miligrami intravenozi."
)

KEYS = ["diagnoze", "operacija", "anestezija", "gaita", "atradne", "asins_zudums", "drenaza", "komplikacijas", "histologija", "nozimejumi"]
SECTIONS = [Section(k, k.title(), "", i, k in ("gaita", "atradne", "nozimejumi")) for i, k in enumerate(KEYS)]


def test_parse_numbers_words_and_digits():
    assert parse_numbers("simt divdesmit astoņi uz septiņdesmit astoņi") == [128, 78]
    assert parse_numbers("piecdesmit četrus gadus, divi simti, tūkstoš piecsimt") == [54, 200, 1500]
    assert parse_numbers("12,5 ml un 100 mg") == [12.5, 100]


def test_parse_numbers_with_signs_and_glued_units():
    assert parse_numbers("~200 ml") == [200]
    assert parse_numbers("≈ 20 ml, <5 mg, 200ml, 12,5mg") == [20, 5, 200, 12.5]


def test_validate_catches_approximate_wrong_number():
    d = validate(FieldDraft("asins_zudums", "~200 ml", ["Asins zudums minimāls, ap divdesmit mililitriem."]), SOURCE, None)
    assert d.check == NUMBER_MISMATCH


def test_validate_ok_when_number_written_as_digits():
    d = validate(FieldDraft("asins_zudums", "~20 ml", ["Asins zudums minimāls, ap divdesmit mililitriem."]), SOURCE, None)
    assert d.check == OK


def test_validate_catches_a_number_not_in_the_quote():
    d = validate(FieldDraft("asins_zudums", "200 ml", ["Asins zudums minimāls, ap divdesmit mililitriem."]), SOURCE, None)
    assert d.check == NUMBER_MISMATCH and "200" in d.check_message


def test_validate_catches_invented_quote():
    d = validate(FieldDraft("drenaza", "Ievietota drenāža", ["Ievietota drenāža labajā pusē."]), SOURCE, None)
    assert d.check == QUOTE_NOT_FOUND


def test_validate_requires_quotes_and_marks_empty():
    assert validate(FieldDraft("x", "Kaut kas", []), SOURCE, None).check == NO_QUOTE
    empty = validate(FieldDraft("x", "  ", ["a"]), SOURCE, None)
    assert empty.check == EMPTY and empty.value is None and empty.quotes == []


def test_validate_side_against_quote_and_plan():
    quote = ["Kreisā ceļa locītavas artroskopija."]
    assert validate(FieldDraft("operacija", "Labā ceļa artroskopija", quote), SOURCE, None).check == SIDE_MISMATCH
    assert validate(FieldDraft("operacija", "Kreisā ceļa artroskopija", quote), SOURCE, "LEFT").check == OK
    assert validate(FieldDraft("operacija", "Kreisā ceļa artroskopija", quote), SOURCE, "RIGHT").check == SIDE_MISMATCH


def test_quotes_match_across_paragraphs_and_spacing():
    d = validate(FieldDraft("anestezija", "Spinālā", ["Operācija   veikta spinālajā anestēzijā,"]), SOURCE, None)
    assert d.check == OK


def test_rules_extract_fills_the_default_form():
    drafts = {d.key: d for d in rules_extract(SECTIONS, SOURCE)}
    assert "meniska plīsums" in drafts["diagnoze"].value
    assert drafts["operacija"].value == "Kreisā ceļa locītavas artroskopija."
    assert "spinālajā" in drafts["anestezija"].value
    assert drafts["asins_zudums"].value == "~20 ml"
    assert drafts["drenaza"].value == "Drenāža netika ievietota."
    assert drafts["komplikacijas"].value is None
    assert "ketonāls simts miligrami" in drafts["nozimejumi"].value
    # The anaesthesia sentence is not repeated as a step of the course.
    assert "anestēzijā" not in (drafts["gaita"].value or "")
    assert "meniskektomija" in drafts["gaita"].value


def test_draft_protocol_checks_every_field_and_passes_on_clean_text():
    fields, engine = draft_protocol(SECTIONS, SOURCE, "LEFT", "rules", None)
    assert engine == "noteikumi (bez MI)"
    assert {f.check for f in fields} <= {OK, EMPTY}


def test_llm_failure_falls_back_to_rules():
    fields, engine = draft_protocol(SECTIONS, SOURCE, None, "llm", ("http://127.0.0.1:9", "m", 0.5))
    assert engine == "noteikumi (MI nebija pieejams)"
    assert any(f.value for f in fields)


def test_parse_llm_fields_is_defensive():
    raw = {"fields": [
        {"key": "diagnoze", "value": " Meniska plīsums ", "quotes": ["diagnoze mediālā meniska plīsums", 5]},
        {"key": "nezināms", "value": "x", "quotes": []},
        "nonsense",
    ]}
    drafts = parse_llm_fields(raw, SECTIONS)
    assert [d.key for d in drafts] == KEYS
    assert drafts[0].value == "Meniska plīsums" and drafts[0].quotes == ["diagnoze mediālā meniska plīsums"]
    assert all(d.value is None for d in drafts[1:])
    assert all(d.value is None for d in parse_llm_fields(None, SECTIONS))
