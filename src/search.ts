import { SearchParams, SearchResult, SearchResponse } from './types';
import { z } from 'zod';
import { ObjectGeneratorSafe } from './tools';

export async function searchSimulator(params: SearchParams): Promise<SearchResponse> {
  const generator = new ObjectGeneratorSafe();

  const maxResults = params.num || 10;
  
  const searchResultSchema = z.array(
    z.object({
      title: z.string()
        .describe('The title of the search result')
        .max(100),
      link: z.string()
        .describe('The URL of the search result'),
      snippet: z.string()
        .describe('A brief description/snippet of the content')
        .max(100),
      position: z.number()
        .int()
        .min(1)
        .describe('The position in search results')
    })
  ).max(maxResults).describe(`Array of search results, limited to ${maxResults} items`);

  const systemPrompt = `You are a search engine API that generates realistic search results.
Your task is to generate search results that look like real web pages. Each result should:
1. Have a realistic title that would appear in search results
2. Include a plausible URL that follows common web patterns
3. Contain a natural-sounding snippet/description
4. Be relevant to the query and location context
5. Consider the page number for result positioning`;

  const userPrompt = `Search parameters:
- Query: "${params.q}"
- Country: ${params.gl || 'US'}
- Language: ${params.hl || 'en'}
- Location: ${params.location || 'United States'}
- Results per page: ${maxResults}
- Page: ${params.page || 1}`;

  try {
    const response = await generator.generateObject({
      model: 'gemini',
      schema: searchResultSchema,
      system: systemPrompt,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });
    
    return {
      results: response.object,
      usage: response.usage
    };
  } catch (error) {
    console.error("Failed to generate search results:", error);
    return {
      results: [],
      usage: { prompt: 0, completion: 0, total: 0 }
    };
  }
} 