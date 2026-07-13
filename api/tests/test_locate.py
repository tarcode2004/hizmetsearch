"""Pure unit tests for app.locate (no DB/FastAPI needed)."""

from app.locate import find_normalized, locate_in_text, normalize_probe


def test_normalize_probe_collapses_whitespace_and_case():
    assert normalize_probe("  Namaz\n\nDinin   Direğidir ") == "namaz dinin direğidir"


def test_normalize_probe_folds_turkish_dotted_i():
    # İ/I/ı all fold to plain 'i' so casing is locale-independent.
    assert normalize_probe("İbrahim IŞIK ılık") == "ibrahim işik ilik"


def test_normalize_probe_folds_curly_quotes():
    # Curly quotes fold to straight; ı folds to i (İ/I/ı triple).
    assert normalize_probe("mü’minin “şiarı”") == "mü'minin \"şiari\""


def test_find_normalized_returns_raw_offset():
    haystack = "Başlık\n\nCömertlik,  her  şeyden önce mü’minin bir şiarıdır."
    probe = normalize_probe("Cömertlik, her şeyden önce mü'minin")
    pos = find_normalized(haystack, probe)
    assert pos == haystack.index("Cömertlik")


def test_find_normalized_missing_returns_none():
    assert find_normalized("kısa bir metin", normalize_probe("alakasız içerik")) is None


def test_locate_in_text_matches_despite_line_wrapping():
    chunk = "Mü'min, kardeşini kendi nefsine tercihte öyle bir noktayı yakalar ki"
    haystack = (
        "önsöz metni burada.\n\nMü’min,\nkardeşini kendi\nnefsine tercihte "
        "öyle bir noktayı yakalar ki, gerekirse canını bile verir."
    )
    pos = locate_in_text(haystack, chunk)
    assert pos == haystack.index("Mü’min")


def test_locate_in_text_falls_back_to_shorter_prefix():
    # Head matches the passage; tail diverges (e.g. research excerpt with
    # an ellipsis) — shorter probe prefixes must still locate it.
    head = "Cömertlik, her şeyden önce mü'minin bir şiarıdır ve onun ahlâkıdır. " * 2
    chunk = head + "BU KUYRUK METNİ PASAJDA HİÇ YOK " * 10
    haystack = "giriş bölümü.\n\n" + head + " devamı da burada uzayıp gider."
    pos = locate_in_text(haystack, chunk)
    assert pos == haystack.index("Cömertlik")


def test_locate_in_text_short_chunk():
    haystack = "Bir Erdem Olarak Cömertlik\n\nVERME AHLÂKI"
    assert locate_in_text(haystack, "VERME AHLÂKI") == haystack.index("VERME")
