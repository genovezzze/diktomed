from diktomed_worker.protocol import (
    DOCUMENT_LV, NUMBER_MISMATCH, OK, SYSTEM_PROMPT, Section, draft_protocol, rules_extract,
)

EP_KEYS = [
    ("ep_pamatdiagnoze", False), ("ep_blakusdiagnozes", True), ("ep_alergijas", True), ("ep_sudzibas", True),
    ("ep_gaita", True), ("ep_izmeklejumi", True), ("ep_arstesana", True), ("ep_rekomendacijas", True),
]
EP_SECTIONS = [Section(k, k, "", i * 10, multi) for i, (k, multi) in enumerate(EP_KEYS)]

# A fictional epicrisis the way a doctor dictates it: jumping between topics
# and adding the allergy at the end. No real patient.
EPICRISIS = (
    "Diagnoze: urīnpūšļa bojājums, S37.2. Blakus slimības: cukura diabēts otrā tipa, arteriāla hipertensija. "
    "Paciente stacionēta ar sāpēm vēdera lejasdaļā pēc histerektomijas. "
    "Datortomogrāfijā aktīvu ekstravazāciju nevēro. Analīzēs leikocīti divpadsmit. "
    "Uzsākta antibiotiku terapija, ceftriaksons divi grami intravenozi. "
    "Stāvoklis uzlabojās. "
    "Rekomendācijas: lietot ciprofloksacīnu piecsimt miligramu divreiz dienā septiņas dienas. "
    "Ierasties uz kontroles vizīti pie urologa trešajā decembrī. "
    "Vēl, pacientei alerģija pret penicilīnu."
)

OPERATION = (
    "Diagnoze: holelitiāze. Veikta laparoskopiska holecistektomija vispārējā anestēzijā. "
    "Operācijas sākumā ievadīts cefazolīns divi grami intravenozi. "
    "Cistiskais vads klipsēts ar trim titāna klipšiem. "
    "Trokāra brūces sašūtas ar Vicryl diegu. "
    "Asins zudums ap piecdesmit mililitriem. "
    "Pēc operācijas ketonāls simts miligrami intravenozi."
)
OP_KEYS = [("diagnoze", False), ("operacija", False), ("anestezija", False), ("gaita", True), ("medikamenti", True),
           ("materiali", True), ("atradne", True), ("asins_zudums", False), ("drenaza", False), ("komplikacijas", False),
           ("histologija", False), ("nozimejumi", True)]
OP_SECTIONS = [Section(k, k, "", i * 10, multi) for i, (k, multi) in enumerate(OP_KEYS)]


def test_epicrisis_sorts_a_jumping_dictation_into_sections():
    d = {f.key: f for f in rules_extract(EP_SECTIONS, EPICRISIS, "EPICRISIS")}
    assert "urīnpūšļa bojājums" in d["ep_pamatdiagnoze"].value
    assert "cukura diabēts" in d["ep_blakusdiagnozes"].value
    assert "cukura diabēts" not in d["ep_pamatdiagnoze"].value
    # Said last, still found.
    assert "penicilīnu" in d["ep_alergijas"].value
    assert "stacionēta" in d["ep_sudzibas"].value
    assert "Datortomogrāfijā" in d["ep_izmeklejumi"].value and "leikocīti" in d["ep_izmeklejumi"].value
    assert "ceftriaksons" in d["ep_arstesana"].value
    assert "ciprofloksacīnu" in d["ep_rekomendacijas"].value and "kontroles vizīti" in d["ep_rekomendacijas"].value
    assert "ciprofloksacīnu" not in (d["ep_arstesana"].value or "")
    assert "uzlabojās" in d["ep_gaita"].value


def test_every_epicrisis_sentence_lands_in_one_section_only():
    used = [q for f in rules_extract(EP_SECTIONS, EPICRISIS, "EPICRISIS") for q in f.quotes]
    assert len(used) == len(set(used))


def test_epicrisis_fields_are_checked_like_protocol_fields():
    fields, _ = draft_protocol(EP_SECTIONS, EPICRISIS, None, "rules", None, "EPICRISIS")
    by_key = {f.key: f for f in fields}
    assert all(f.check == OK for f in fields if f.value)
    # A dose the doctor never said is caught in an epicrisis too.
    from diktomed_worker.protocol import FieldDraft, validate

    wrong = validate(FieldDraft("ep_rekomendacijas", "ciprofloksacīns 750 mg", by_key["ep_rekomendacijas"].quotes), EPICRISIS, None)
    assert wrong.check == NUMBER_MISMATCH


def test_operation_medication_and_materials_have_their_own_sections():
    d = {f.key: f for f in rules_extract(OP_SECTIONS, OPERATION, "OPERATION")}
    assert "cefazolīns" in d["medikamenti"].value
    assert "ketonāls" in d["nozimejumi"].value and "ketonāls" not in d["medikamenti"].value
    assert "Vicryl" in d["materiali"].value and "klipšiem" in d["materiali"].value
    assert "cefazolīns" not in (d["gaita"].value or "") and "Vicryl" not in (d["gaita"].value or "")
    assert d["asins_zudums"].value == "~50 ml"
    assert "holecistektomija" in d["operacija"].value


def test_llm_prompt_names_the_document():
    assert "epikrīzes" in SYSTEM_PROMPT.format(document=DOCUMENT_LV["EPICRISIS"])
    assert "operācijas protokola" in SYSTEM_PROMPT.format(document=DOCUMENT_LV["OPERATION"])
    assert '{"fields"' in SYSTEM_PROMPT.format(document="x")


def test_a_spoken_heading_carries_the_next_sentence():
    text = "Diagnose. Dzemdes mioma, stāvoklis pēc histerektomijas. Datortomogrāfijā izmaiņu nav."
    d = {f.key: f for f in rules_extract(EP_SECTIONS, text, "EPICRISIS")}
    # "Diagnose" is how the recogniser often spells it.
    assert d["ep_pamatdiagnoze"].value == "Dzemdes mioma, stāvoklis pēc histerektomijas."
    assert "Datortomogrāfijā" in d["ep_izmeklejumi"].value


def test_a_multi_heading_stops_at_the_next_heading():
    text = "Rekomendācijas. Lietot ciprofloksacīnu. Dzert daudz šķidruma. Alerģijas. Penicilīns."
    d = {f.key: f for f in rules_extract(EP_SECTIONS, text, "EPICRISIS")}
    assert d["ep_rekomendacijas"].quotes == ["Lietot ciprofloksacīnu.", "Dzert daudz šķidruma."]
    assert d["ep_alergijas"].quotes == ["Penicilīns."]


def test_a_multi_section_also_collects_what_was_said_elsewhere():
    text = "Rekomendācijas. Dzert daudz šķidruma. Diagnoze. Cistīts. Kontroles vizīte pēc nedēļas."
    d = {f.key: f for f in rules_extract(EP_SECTIONS, text, "EPICRISIS")}
    assert d["ep_rekomendacijas"].quotes == ["Dzert daudz šķidruma.", "Kontroles vizīte pēc nedēļas."]
    assert d["ep_pamatdiagnoze"].quotes == ["Cistīts."]
