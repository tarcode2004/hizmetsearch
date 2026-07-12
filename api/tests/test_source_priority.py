from dataclasses import dataclass

from app.source_priority import infer_source_context, prioritize_results


@dataclass
class Chunk:
    chunk_id: str
    collection: str
    author_speaker: str = ""


@dataclass
class Result:
    chunk: Chunk
    score: float


def item(name: str, category: str, score: float) -> Result:
    if category == "risale":
        chunk = Chunk(name, "Risale-i Nur", "Said Nursi")
    elif category == "risale_dersleri":
        chunk = Chunk(name, "Risale-i Nur Dersleri", "")
    elif category == "pirlanta":
        chunk = Chunk(name, "Hocaefendi Külliyatı", "Fethullah Gülen")
    elif category == "gulen_sohbetleri":
        chunk = Chunk(name, "Herkul Bamteli", "Fethullah Gülen")
    else:
        chunk = Chunk(name, "Other", "Other")
    return Result(chunk, score)


def ids(results):
    return [result.chunk.chunk_id for result in results]


def test_context_inference_routes_spoken_sources_by_speaker():
    assert infer_source_context("Bediüzzaman Nursi'ye göre iman") == "risale"
    assert infer_source_context("Fethullah Gülen'in eserlerinde ümit") == "pirlanta"
    assert infer_source_context("Risale derslerinde bu konu") == "risale_dersleri"
    assert infer_source_context("Fethullah Gülen'in şu sohbeti") == "gulen_sohbetleri"
    assert infer_source_context("Bu vaazda ne anlatılıyor?") == "spoken"


def test_priority_is_bounded_to_nearby_relevance_windows():
    results = [
        item("h0", "hizmet", .99),
        item("r0", "risale", .98),
        item("p0", "pirlanta", .97),
        item("h1", "hizmet", .60),
        item("p1", "pirlanta", .59),
    ]
    ordered = ids(prioritize_results(results, 4, "pirlanta"))
    assert ordered[:3] == ["p0", "h0", "r0"]
    # A weaker result in the next window cannot jump ahead of the first one.
    assert ordered[3] == "p1"


def test_broad_query_protects_near_cutoff_primary_without_deep_rescue():
    results = [
        item("r0", "risale", .99),
        item("r1", "risale", .98),
        item("h0", "hizmet", .97),
        item("r2", "risale", .96),
        item("p0", "pirlanta", .95),
        item("h1", "hizmet", .94),
        item("p-too-far", "pirlanta", .40),
    ]
    assert "p0" in ids(prioritize_results(results, 4, "broad"))


def test_explicit_gulen_sohbet_promotes_herkul_not_risale_ders():
    results = [
        item("d0", "risale_dersleri", .99),
        item("g0", "gulen_sohbetleri", .98),
        item("p0", "pirlanta", .97),
    ]
    assert ids(prioritize_results(results, 3, "gulen_sohbetleri"))[0] == "g0"
