import z, { TypeOf } from 'zod';

export const zSearchParams = z.object({
  q: z.string(),
  gl: z.string().optional(),
  location: z.string().optional(),
  hl: z.string().optional(),
  num: z.number().optional(),
  page: z.number().optional(),
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
    prompt: number;
    completion: number;
    total: number;
  };
}

