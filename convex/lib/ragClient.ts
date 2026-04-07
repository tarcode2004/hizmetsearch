/**
 * HTTP client for calling the Python RAG API from Convex actions.
 */

interface SearchOptions {
  top_k?: number;
  language?: string | null;
  collection?: string | null;
  use_reranker?: boolean;
}

interface ChunkResult {
  chunk_id: string;
  doc_id: string;
  text: string;
  parent_text: string | null;
  source_type: string;
  language: string;
  collection: string;
  title: string;
  author_speaker: string;
  publisher: string;
  chapter_section: string;
  page_number: number | null;
  timestamp_start: number | null;
  timestamp_end: number | null;
}

interface SearchResultItem {
  chunk: ChunkResult;
  score: number;
  rerank_score: number | null;
}

interface SearchResponse {
  results: SearchResultItem[];
  query: string;
  result_count: number;
  retrieval_time_ms: number;
}

export async function searchRAG(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResponse> {
  const ragUrl = process.env.RAG_API_URL ?? "http://localhost:8000";
  const ragKey = process.env.RAG_API_KEY ?? "";

  const body = {
    query,
    top_k: options.top_k ?? 5,
    language: options.language ?? null,
    collection: options.collection ?? null,
    use_reranker: options.use_reranker ?? true,
  };

  const response = await fetch(`${ragUrl}/api/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(ragKey ? { "X-API-Key": ragKey } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`RAG API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
