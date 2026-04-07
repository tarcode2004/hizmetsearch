export interface ChunkResult {
  chunk_id: string;
  doc_id: string;
  text: string;
  parent_text: string | null;
  source_type: "text" | "audio" | "video" | "scanned";
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

export interface SearchResult {
  chunk: ChunkResult;
  score: number;
  rerank_score: number | null;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
  result_count: number;
  retrieval_time_ms: number;
}

export type AIModel = "gemini" | "claude";
export type SearchMode = "results" | "ai";

export interface Message {
  _id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  model?: AIModel;
  sources?: ChunkResult[];
  isStreaming: boolean;
  createdAt: number;
}

export interface Conversation {
  _id: string;
  userId: string;
  title: string;
  model: AIModel;
  createdAt: number;
  updatedAt: number;
  isArchived: boolean;
}
