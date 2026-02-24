/**
 * GitHub REST API client.
 * Fetches repo tree, file contents, and metadata for public repositories.
 */

export interface RepoInfo {
  owner: string;
  repo: string;
  defaultBranch: string;
  description: string;
  stars: number;
  language: string | null;
  topics: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TreeFile {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

export interface FileContent {
  path: string;
  content: string;
}

// Max characters per file to avoid blowing up the prompt
const MAX_FILE_CHARS = 8000;
// Max total chars across all files sent to the model
const MAX_TOTAL_CHARS = 120000;
// File extensions considered "source code" worth reading
const READABLE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift",
  ".c", ".cpp", ".h", ".hpp", ".cs",
  ".json", ".yaml", ".yml", ".toml", ".env.example",
  ".md", ".mdx", ".txt",
  ".sh", ".bash", ".zsh",
  ".prisma", ".graphql", ".gql", ".sql",
  ".html", ".css", ".scss",
  "Dockerfile", "Makefile",
]);

// Paths/prefixes to skip entirely
const SKIP_PREFIXES = [
  "node_modules/", ".git/", ".next/", "dist/", "build/", "coverage/",
  ".turbo/", "out/", "__pycache__/", ".venv/", "venv/",
  ".cache/", ".parcel-cache/",
];

const SKIP_EXACT = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
  "bun.lockb", ".DS_Store",
]);

/**
 * Parse a GitHub URL into { owner, repo }.
 * Supports: https://github.com/owner/repo[.git][/...]
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } {
  const cleaned = url.trim().replace(/\.git$/, "").replace(/\/$/, "");
  const match = cleaned.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/]+)/
  );
  if (!match) {
    throw new Error(
      `Invalid GitHub URL: "${url}". Expected format: https://github.com/owner/repo`
    );
  }
  return { owner: match[1], repo: match[2] };
}

/**
 * Fetch basic repository metadata.
 */
export async function fetchRepoInfo(
  owner: string,
  repo: string,
  token?: string
): Promise<RepoInfo> {
  const headers = buildHeaders(token);
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `GitHub API error ${res.status} for ${owner}/${repo}: ${body}`
    );
  }
  const data = await res.json();
  return {
    owner,
    repo,
    defaultBranch: data.default_branch ?? "main",
    description: data.description ?? "",
    stars: data.stargazers_count ?? 0,
    language: data.language ?? null,
    topics: data.topics ?? [],
    createdAt: data.created_at ?? "",
    updatedAt: data.updated_at ?? "",
  };
}

/**
 * Fetch the full recursive file tree of a repository.
 */
export async function fetchRepoTree(
  owner: string,
  repo: string,
  branch: string,
  token?: string
): Promise<TreeFile[]> {
  const headers = buildHeaders(token);
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub tree API error ${res.status}: ${body}`);
  }
  const data = await res.json();
  const tree: TreeFile[] = (data.tree ?? []).map((item: Record<string, unknown>) => ({
    path: item.path as string,
    type: item.type as "blob" | "tree",
    size: item.size as number | undefined,
  }));
  return tree;
}

/**
 * Fetch the raw text content of a single file.
 */
export async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  token?: string
): Promise<string> {
  const headers = buildHeaders(token);
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    { headers }
  );
  if (!res.ok) return "";
  const data = await res.json();
  if (data.encoding === "base64" && data.content) {
    const decoded = Buffer.from(
      data.content.replace(/\n/g, ""),
      "base64"
    ).toString("utf-8");
    return decoded.slice(0, MAX_FILE_CHARS);
  }
  return "";
}

/**
 * Select which files from the tree are worth reading.
 */
export function selectReadableFiles(tree: TreeFile[]): TreeFile[] {
  return tree.filter((f) => {
    if (f.type !== "blob") return false;
    if (SKIP_EXACT.has(f.path)) return false;
    if (SKIP_PREFIXES.some((prefix) => f.path.startsWith(prefix))) return false;
    const filename = f.path.split("/").pop() ?? "";
    if (SKIP_EXACT.has(filename)) return false;
    if (READABLE_EXTENSIONS.has(filename)) return true; // Dockerfile, Makefile, etc.
    const ext = "." + filename.split(".").pop();
    return READABLE_EXTENSIONS.has(ext);
  });
}

/**
 * Fetch contents for a list of files, respecting the total char budget.
 */
export async function fetchSelectedFiles(
  owner: string,
  repo: string,
  files: TreeFile[],
  token?: string
): Promise<FileContent[]> {
  const results: FileContent[] = [];
  let totalChars = 0;

  // Prioritize important files first
  const sorted = [...files].sort((a, b) => {
    const priority = (path: string) => {
      if (/^README/i.test(path)) return 0;
      if (/package\.json$/.test(path) && !path.includes("/")) return 1;
      if (/\.(ts|tsx|py|go|rs|java)$/.test(path)) return 2;
      if (/\.(md|yaml|yml|toml)$/.test(path)) return 3;
      return 4;
    };
    return priority(a.path) - priority(b.path);
  });

  for (const file of sorted) {
    if (totalChars >= MAX_TOTAL_CHARS) break;
    const content = await fetchFileContent(owner, repo, file.path, token);
    if (content.trim()) {
      results.push({ path: file.path, content });
      totalChars += content.length;
    }
  }

  return results;
}

function buildHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const t = token ?? process.env.GITHUB_TOKEN;
  if (t) headers["Authorization"] = `Bearer ${t}`;
  return headers;
}
