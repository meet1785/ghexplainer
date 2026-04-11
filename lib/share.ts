/**
 * URL sharing utilities for ghexplainer.
 *
 * Enables deep-linkable repository analyses via the `?repo=<github-url>`
 * query parameter. Shareable links allow users to distribute direct links
 * to any public GitHub repository analysis.
 *
 * All functions are pure and side-effect free for easy testing.
 */

/**
 * Encode a GitHub repository URL into a URL-safe query parameter value.
 *
 * @example
 *   encodeRepoParam("https://github.com/owner/repo")
 *   // → "https%3A%2F%2Fgithub.com%2Fowner%2Frepo"
 */
export function encodeRepoParam(repoUrl: string): string {
  return encodeURIComponent(repoUrl.trim());
}

/**
 * Decode a `?repo=` query parameter value back into a GitHub URL.
 * Returns `null` if the param is empty or cannot be decoded.
 *
 * @example
 *   decodeRepoParam("https%3A%2F%2Fgithub.com%2Fowner%2Frepo")
 *   // → "https://github.com/owner/repo"
 */
export function decodeRepoParam(param: string): string | null {
  if (!param || !param.trim()) return null;
  try {
    const decoded = decodeURIComponent(param.trim());
    return decoded || null;
  } catch {
    return null;
  }
}

/**
 * Build a complete shareable URL for a given GitHub repository URL.
 *
 * @param repoUrl  The GitHub repository URL to encode.
 * @param base     Optional base URL (origin + pathname). Defaults to the
 *                 current page URL when running in a browser.
 *
 * @example
 *   buildShareUrl("https://github.com/owner/repo", "https://ghexplainer.app/")
 *   // → "https://ghexplainer.app/?repo=https%3A%2F%2Fgithub.com%2Fowner%2Frepo"
 */
export function buildShareUrl(repoUrl: string, base?: string): string {
  const baseUrl =
    base ??
    (typeof window !== "undefined"
      ? window.location.origin + window.location.pathname
      : "");
  const cleanBase = baseUrl.replace(/\?.*$/, ""); // Strip any existing query string
  return `${cleanBase}?repo=${encodeRepoParam(repoUrl)}`;
}

/**
 * Extract a repository URL from a `URLSearchParams` (or compatible) object.
 * Returns `null` when the `repo` parameter is absent or empty.
 *
 * @example
 *   parseRepoFromSearchParams(new URLSearchParams("?repo=https%3A%2F%2Fgithub.com%2Fowner%2Frepo"))
 *   // → "https://github.com/owner/repo"
 */
export function parseRepoFromSearchParams(
  params: URLSearchParams | { get(key: string): string | null }
): string | null {
  const raw = params.get("repo");
  if (!raw) return null;
  return decodeRepoParam(raw);
}
