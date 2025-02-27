import { SearchParams, SearchResponse, zSearchParams } from './types';
import { z } from 'zod';
import { ObjectGeneratorSafe } from './tools';
import { KNOWLEDGE_CUTOFF } from './config';

export async function searchSimulator(input: SearchParams): Promise<SearchResponse> {
  const generator = new ObjectGeneratorSafe();
  const params = zSearchParams.parse(input);
  const maxResults = Math.min(params.num || 10, 30);
  
  // Enhanced schema with stronger restrictions and more realistic snippet generation
  const searchResultSchema = z.array(
    z.object({
      title: z.string()
        .describe(`The title of the search result - must be factual and based on real websites that existed as of ${KNOWLEDGE_CUTOFF}. No fictional sites.`)
        .min(5)
        .max(100),
      link: z.string()
        .describe(`The URL of the search result - must be a realistic, properly formatted URL with NO placeholders like "example" or "sample". Use authentic patterns, e.g.:
          - YouTube: https://www.youtube.com/watch?v=dQw4w9WgXcQ (actual video IDs are 11 characters)
          - Wikipedia: https://en.wikipedia.org/wiki/Artificial_intelligence (actual topic slug)
          - News sites: https://www.theguardian.com/technology/2023/nov/15/ai-regulation-global-summit (real date/category/slug)
          - Government sites: https://www.cdc.gov/coronavirus/2019-ncov/index.html (authentic paths)
          - Academic: https://arxiv.org/abs/2201.08239 (real paper IDs)
          Must reflect real websites that existed as of ${KNOWLEDGE_CUTOFF}. Must be a properly formatted URL without placeholder terms like 'example'.`)
        .min(10)
        .max(300),
      snippet: z.string()
        .describe(`A fragment of text from the actual content that CONTAINS THE QUERY TERMS. This is NOT a summary - it's an actual extract where the query terms appear, with those terms surrounded by <b> tags. For example, if the query is "climate change", the snippet might be "...effects of <b>climate change</b> on biodiversity include...". Must be based on factual content available as of ${KNOWLEDGE_CUTOFF}.`)
        .min(20)
        .max(500),
      position: z.number()
        .int()
        .min(1)
        .max(maxResults)
        .describe('The position of this result in the SERP (1-based indexing)'),
      domain:  z.string()
          .describe('The official name of the website/company that owns this domain (e.g., "YouTube", "Wikipedia", "The New York Times"). Use the actual brand name, not just the domain name like jina.ai, google.com')
          .min(2)
          .max(50)
    })
  ).min(1).max(maxResults).describe(`Generate realistic search engine results limited to ${maxResults} items. Results must be based ONLY on information available as of ${KNOWLEDGE_CUTOFF} and reflect what a real search engine would return.`);

  // Improved system prompt focused on reducing hallucination and creating realistic snippets
  const systemPrompt = `You are a search engine API that generates realistic and factual search results.
Your task is to simulate what a real search engine would return for the given query based ONLY on information available as of the knowledge cutoff date (${KNOWLEDGE_CUTOFF}).

IMPORTANT RULES TO FOLLOW:
1. Only generate results for real websites and web pages that existed before ${KNOWLEDGE_CUTOFF}
2. Each result must contain factually accurate information known before ${KNOWLEDGE_CUTOFF}
3. Include diverse result types: official sites, news articles, blogs, forums, academic sources, etc.
4. NEVER EVER use placeholder values like "example", "sample", or "placeholder" in URLs
5. For YouTube URLs, always use actual video IDs (11 characters like "dQw4w9WgXcQ" or "8O_MwlZ2dEk")
6. All URLs must be complete with proper subdomains, paths, and query parameters as appropriate
7. For product pages, use realistic product IDs/SKUs (never "product123" or similar placeholders)
8. For news articles, use actual date-based URL structures (like "/2023/11/15/article-title")
9. NEVER generate fictional websites, URLs, or speculative content

CRITICAL SNIPPET REQUIREMENTS:
1. Snippets are NOT summaries - they are ACTUAL FRAGMENTS of text from the page showing where query terms appear
2. Snippets MUST CONTAIN the query terms, and those terms should be wrapped in <b> tags (e.g., "effects of <b>climate change</b> on biodiversity")
3. Snippets should be contextual extracts that show how the query terms appear in the content
4. If the query has multiple terms, try to find fragments where multiple terms appear close together
5. Snippets should start and end naturally (not mid-word) and include enough context to understand the fragment
6. It's okay to use "..." to indicate text omission before or after the snippet
7. For navigational queries (like searching for "Facebook"), include snippets from the target site's homepage description or key pages
8. If a page is in a different language, provide the snippet in that language with appropriate query term highlighting

DOMAIN PROFILE REQUIREMENTS:
1. Each domain must be ACCURATE and REALISTIC for the actual website
2. The domain should be the official company/site name (e.g., "The New York Times" not just "nytimes")

SEARCH BEHAVIOR GUIDELINES:
1. For queries about events after ${KNOWLEDGE_CUTOFF}, return only information available up to ${KNOWLEDGE_CUTOFF}, showing how a real search engine would handle such queries
2. Results for page 2+ should be progressively less relevant but still factual
3. Respect the specified country, language and location for regional relevance
4. If uncertain about facts as of ${KNOWLEDGE_CUTOFF}, return general topic information rather than potentially incorrect specifics
5. Position top-authority sites (Wikipedia, official sites, major news outlets) higher in results when appropriate
6. For technical queries, prioritize documentation, forums, and educational resources
7. Mirror real search engine behavior by including appropriate result diversity based on query intent

This is simulating a production SERP API - your results should be indistinguishable from real search engine results.`;

  // User prompt formatted as a JSON request to reinforce API behavior
  const userPrompt = JSON.stringify({
    endpoint: "/api/v1/search",
    method: "GET",
    request: {
      query: params.q,
      country: params.gl || 'US',
      language: params.hl || 'en',
      location: params.location || 'United States',
      resultsPerPage: maxResults,
      page: params.page || 1,
      knowledgeCutoffDate: KNOWLEDGE_CUTOFF
    },
    requirements: {
      accuracy: "high", 
      factuality: "strict",
      realSites: true,
      noHallucination: true,
      snippetBehavior: "extractWithHighlighting",
      includeDomainProfiles: true
    }
  }, null, 2);

  try {
    const response = await generator.generateObject({
      model: 'gemini',
      schema: searchResultSchema,
      system: systemPrompt,
      messages: [
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
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    };
  }
}

export default searchSimulator;