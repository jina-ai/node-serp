export interface SearchParams {
  q: string;
  gl?: string;
  location?: string;
  hl?: string;
  num?: number;
  page?: number;
  knowledgeCutoff?: string;
}

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

export interface SearchResponse {
  results: SearchResult[];
  usage: {
    prompt: number;
    completion: number;
    total: number;
  };
}

