import z, { TypeOf } from 'zod';

export const zSearchParams = z.object({
  q: z.string(),
  gl: z.coerce.string().optional(),
  location: z.coerce.string().optional(),
  hl: z.coerce.string().optional(),
  num: z.coerce.number().optional(),
  page: z.coerce.number().optional(),
});
export interface SearchParams extends TypeOf<typeof zSearchParams> {}

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

export interface SearchResponse {
  results: SearchResult[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

