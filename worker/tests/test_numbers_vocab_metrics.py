from diktomed_worker.config import libpq_url
from diktomed_worker.metrics import cer, wer
from diktomed_worker.numbers_lv import find_numbers, is_number_token
from diktomed_worker.vocab import build_initial_prompt


def test_number_words():
    for t in ["piecdesmit", "divus", "simt", "divsimt", "12,5", "trīspadsmit", "tūkstoš", "100%"]:
        assert is_number_token(t), t
    for t in ["vien", "piece", "labā", "divdesmitgadnieks"]:
        assert not is_number_token(t), t


def test_number_runs_stop_at_punctuation():
    spans = find_numbers("simt divdesmit astoņi, divi".split())
    assert [(s.first, s.last) for s in spans] == [(0, 2), (3, 3)]


def test_initial_prompt_is_latvian_bounded_and_deduplicated():
    prompt = build_initial_prompt(["hemostāze", "Hemostāze", "trokārs"], ["koagulators"], max_chars=60)
    assert prompt.startswith("Operācijas protokols. Termini: koagulators, hemostāze")
    assert len(prompt) <= 61
    assert build_initial_prompt([], []) is None


def test_wer_and_cer():
    assert wer("Veiksim hemostāzi.", "veiksim hemostāzi") == (0, 2)
    assert wer("padodiet koagulatoru", "padodiet koagulātoru") == (1, 2)
    assert cer("abc", "abd") == (1, 3)


def test_prisma_params_are_removed_from_database_url():
    url = "postgresql://u:p@db:5432/diktomed?schema=public&sslmode=require&connection_limit=5"
    assert libpq_url(url) == "postgresql://u:p@db:5432/diktomed?sslmode=require"
