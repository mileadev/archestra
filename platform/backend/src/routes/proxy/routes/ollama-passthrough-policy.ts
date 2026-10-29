/**
 * Explicitly bound the Ollama catch-all proxy to read-only model discovery.
 *
 * Chat completions, native chat, and embeddings must be handled by their own
 * instrumented routes, never the catch-all. Native inference would bypass policy/usage
 * accounting; management routes can alter or delete local models.
 *
 * This is an LLM proxy, not an Ollama administration API.
 */
const AGENT_UUID =
  /^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/i;

const DISCOVERY_GET = new Set([
  "/models",
  "/api/tags",
  "/api/ps",
  "/api/version",
]);
const DISCOVERY_POST = new Set(["/api/show"]);

export function isAllowedOllamaPassthroughRequest(
  method: string,
  requestUrl: string,
  apiPrefix: string,
): boolean {
  // Fastify request.url is a relative path. Do not normalize or decode paths:
  // an upstream may interpret encoded slashes or dot segments differently.
  const requestPath = requestUrl.split("?")[0];
  if (!requestPath.startsWith(`${apiPrefix}/`)) return false;
  const suffix = requestPath
    .slice(apiPrefix.length)
    .replace(AGENT_UUID, "");

  // All permitted paths are literal ASCII, with no encoded path characters.
  // This also rejects attempts to smuggle management paths via normalization.
  if (suffix.includes("%") || suffix.includes("\\") || suffix.includes("//")) {
    return false;
  }
  const verb = method.toUpperCase();
  return verb === "GET"
    ? DISCOVERY_GET.has(suffix)
    : verb === "POST" && DISCOVERY_POST.has(suffix);
}
