// Web search via the Tavily API. https://docs.tavily.com
export type SearchResult = {
  title: string;
  url: string;
  content: string;
  score?: number;
};

export type SubQueryResult = {
  query: string;
  results: SearchResult[];
  ms: number;
};

function apiKey(): string {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY is not set");
  return key;
}

async function searchOne(query: string, maxResults = 4): Promise<SubQueryResult> {
  const start = Date.now();
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey(),
      query,
      max_results: maxResults,
      search_depth: "basic",
    }),
  });
  if (!res.ok) {
    throw new Error(`Tavily error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const results: SearchResult[] = (data.results || []).map((r: any) => ({
    title: r.title,
    url: r.url,
    content: r.content,
    score: r.score,
  }));
  return { query, results, ms: Date.now() - start };
}

// Fire every sub-query in parallel — this is where instant inference pays off:
// the model can plan many queries because retrieving + synthesizing them is fast.
export async function searchAll(queries: string[], maxResults = 4): Promise<SubQueryResult[]> {
  return Promise.all(queries.map((q) => searchOne(q, maxResults)));
}
