/**
 * Fetch trending search keywords from Temu agentseller for a given category.
 *
 * The real endpoint has not been reverse-engineered yet (would require
 * capturing network traffic on the agentseller selection/traffic-analysis
 * pages via Chrome MCP, same flow used for skc/pageQuery in 03244da).
 *
 * Until that is done this returns an empty array — callers MUST handle
 * that case gracefully. The AI title rewrite falls back to using only the
 * original title when no keywords are available, so the feature still
 * works; the keywords just enrich the prompt when present.
 *
 * TODO: once the endpoint is known, use callTemuApi(endpoint, {catId})
 * inside a try/catch and map the response into a string[]; on failure
 * continue returning [] to keep the AI path unblocked.
 */
export async function fetchTrendingKeywords(_catId?: number): Promise<string[]> {
  return [];
}
