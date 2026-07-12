"""Pure, bounded user-context source-priority policy."""

from __future__ import annotations

_RISALE_CONTEXT = ("risale", "nursi", "nursî", "bediüzzaman", "said nurs")
_GULEN_CONTEXT = ("gülen", "gulen", "fethullah", "pırlanta", "pirlanta")
_SPOKEN_CONTEXT = ("ders", "sohbet", "vaaz", "sermon", "lecture")
_HERKUL_COLLECTIONS = ("herkul kırık testi", "herkul nağme", "herkul bamteli")


def infer_source_context(query: str) -> str:
    """Infer authority context without mapping all spoken material to Risale."""
    folded = query.casefold()
    is_spoken = any(term in folded for term in _SPOKEN_CONTEXT)
    is_risale = any(term in folded for term in _RISALE_CONTEXT)
    is_gulen = any(term in folded for term in _GULEN_CONTEXT)
    if is_spoken and is_gulen:
        return "gulen_sohbetleri"
    if is_spoken and is_risale:
        return "risale_dersleri"
    if is_spoken:
        return "spoken"
    if is_risale:
        return "risale"
    if is_gulen or "hizmet" in folded:
        return "pirlanta"
    return "broad"


def source_category(result) -> str:
    chunk = result.chunk
    collection = (getattr(chunk, "collection", "") or "").casefold()
    author = (getattr(chunk, "author_speaker", "") or "").casefold()
    if collection == "risale-i nur":
        return "risale"
    if collection == "risale-i nur dersleri":
        return "risale_dersleri"
    if "gülen" in author or "gulen" in author:
        if collection in _HERKUL_COLLECTIONS:
            return "gulen_sohbetleri"
        return "pirlanta"
    return "hizmet"


def _priority(category: str, context: str) -> int:
    if context in {"risale", "pirlanta", "risale_dersleri", "gulen_sohbetleri"}:
        return 0 if category == context else 1
    if context == "spoken":
        return 0 if category in {"risale_dersleri", "gulen_sohbetleri"} else 1
    return 0 if category in {"risale", "pirlanta"} else 1


def prioritize_results(results: list, top_k: int, context: str) -> list:
    """Apply authority only among nearby, already relevance-ranked results.

    Three-result windows bound any promotion to two positions. For broad
    questions, a missing primary corpus may enter the page only when its best
    result was already within two positions of the cutoff.
    """
    ordered: list = []
    window_size = 3
    for start in range(0, len(results), window_size):
        window = list(enumerate(results[start : start + window_size]))
        window.sort(key=lambda pair: (_priority(source_category(pair[1]), context), pair[0]))
        ordered.extend(result for _, result in window)

    if context == "broad" and top_k >= 4:
        page = ordered[:top_k]
        present = {source_category(result) for result in page}
        for missing in ({"risale", "pirlanta"} - present):
            nearby = next(
                (
                    result
                    for result in ordered[top_k : top_k + 2]
                    if source_category(result) == missing
                ),
                None,
            )
            if nearby is not None:
                replace_at = next(
                    (
                        i
                        for i in range(len(page) - 1, -1, -1)
                        if source_category(page[i]) not in {"risale", "pirlanta"}
                    ),
                    len(page) - 1,
                )
                page[replace_at] = nearby
        return page
    return ordered[:top_k]
