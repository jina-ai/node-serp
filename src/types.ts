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

export interface LanguageModelUsage {
  prompt: number;
  completion: number;
  total: number;
}

export class NoObjectGeneratedError extends Error {
  constructor(public text: string, public usage: LanguageModelUsage) {
    super('Failed to generate object according to schema');
  }

  static isInstance(error: unknown): error is NoObjectGeneratedError {
    return error instanceof NoObjectGeneratedError;
  }
} 