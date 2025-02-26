import type { LanguageModelUsage, NoObjectGeneratedError } from 'ai';

export interface SearchParams {
  q: string;
  gl?: string;
  location?: string;
  hl?: string;
  num?: number;
  page?: number;
}

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

// Re-export types from 'ai' package
export type { LanguageModelUsage, NoObjectGeneratedError }; 