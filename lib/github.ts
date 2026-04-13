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

// Max characters per file — Gemini 2.5 has 1M token input, so we can afford
// more per file for better analysis quality
const MAX_FILE_CHARS = 8000;
// Max total chars across all files — ~50K tokens input, well within 1M limit.
// This lets us pack everything into 1-2 API calls instead of 5+
const MAX_TOTAL_CHARS = 200_000;
// File extensions considered "source code" worth reading
// EXCLUDED: .md, .mdx, .txt, .json configs — these waste tokens without adding
// meaningful code insight. We keep package.json/tsconfig only via priority logic.
const READABLE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift",
  ".c", ".cpp", ".h", ".hpp", ".cs",
  ".yaml", ".yml", ".toml", ".env.example",
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
  "vendor/", "third_party/", ".github/",
  "test/", "tests/", "__tests__/", "spec/", "e2e/",
  "fixtures/", "testdata/", "mock/", "mocks/",
  "docs/", "examples/", "demo/", "samples/",
  "static/", "public/assets/", "assets/images/",
];

const SKIP_EXACT = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
  "bun.lockb", ".DS_Store", ".gitignore", ".eslintrc.json",
  ".prettierrc", ".editorconfig", "LICENSE", "LICENSE.md",
  "seed-history.ts", "seed-history.js", "seed-data.ts", "seed-data.js",
  "CHANGELOG.md", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md",
  "README.md", "README.rst", "README.txt", "README",
  ".eslintrc", ".eslintrc.js", ".eslintrc.cjs", "eslint.config.mjs",
  ".prettierrc.js", ".prettierrc.json", ".prettierignore",
  "babel.config.js", "jest.config.js", "jest.config.ts",
  "webpack.config.js", "rollup.config.js", "vite.config.ts",
  "tsconfig.json", "tsconfig.build.json", "tsconfig.node.json",
  "postcss.config.js", "postcss.config.mjs", "postcss.config.cjs",
  "tailwind.config.js", "tailwind.config.ts",
  "next-env.d.ts", "next.config.js", "next.config.ts", "next.config.mjs",
  ".env", ".env.local", ".env.development", ".env.production",
  "renovate.json", ".nvmrc", ".node-version", ".tool-versions",
  "docker-compose.yml", "docker-compose.yaml",
  "Procfile", "vercel.json", "netlify.toml", "fly.toml",
  ".dockerignore", ".gitattributes", ".npmignore", ".npmrc",
  "commitlint.config.js", "lint-staged.config.js", ".husky",
  "SECURITY.md", "CODEOWNERS", ".mailmap",
]);

/**
 * Parse a GitHub URL into { owner, repo }.
 * Supports:
 * - https://github.com/owner/repo[.git][/...]
 * - github.com/owner/repo
 * - git@github.com:owner/repo[.git]
 * - ssh://git@github.com/owner/repo[.git]
 * - owner/repo
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } {
  const input = url.trim();
  if (!input) {
    throw new Error(
      `Invalid GitHub URL: "${url}". Expected format: https://github.com/owner/repo or owner/repo`
    );
  }

  const shorthandMatch = input.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (shorthandMatch) {
    return { owner: shorthandMatch[1], repo: shorthandMatch[2] };
  }

  const sshMatch = input.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  let normalized = input;
  if (/^github\.com\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    if (host !== "github.com" && host !== "www.github.com") {
      throw new Error("Non-GitHub host");
    }

    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length < 2) {
      throw new Error("Missing owner/repo path");
    }

    const owner = segments[0];
    const repo = segments[1].replace(/\.git$/i, "");

    if (!owner || !repo) {
      throw new Error("Missing owner or repo");
    }

    return { owner, repo };
  } catch {
    throw new Error(
      `Invalid GitHub URL: "${url}". Expected format: https://github.com/owner/repo or owner/repo`
    );
  }
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
 * Aggressively filters out test/generated/config files to save tokens.
 */
export function selectReadableFiles(tree: TreeFile[]): TreeFile[] {
  return tree.filter((f) => {
    if (f.type !== "blob") return false;
    if (SKIP_EXACT.has(f.path)) return false;
    if (SKIP_PREFIXES.some((prefix) => f.path.startsWith(prefix))) return false;
    const filename = f.path.split("/").pop() ?? "";
    if (SKIP_EXACT.has(filename)) return false;
    // Skip all README files regardless of extension
    if (/^readme/i.test(filename)) return false;
    // Skip all markdown/text documentation files
    if (/\.(md|mdx|txt|rst)$/i.test(filename)) return false;
    // Skip all JSON config files (except package.json at root for dep info)
    if (/\.json$/i.test(filename) && filename !== "package.json") return false;
    // Keep root package.json only (not nested ones like packages/x/package.json)
    if (filename === "package.json" && f.path.includes("/")) return false;
    // Skip test files by name pattern
    if (/\.(test|spec|e2e|bench)\.(ts|tsx|js|jsx|py|go|rs|java)$/.test(filename)) return false;
    if (/^test_/.test(filename) || /_test\.(go|py)$/.test(filename)) return false;
    // Skip seed/fixture/mock data files (contain hardcoded data that pollutes analysis)
    if (/^seed[-_]/.test(filename)) return false;
    if (/[-_](seed|fixture|mock[-_]?data|stub)s?\.(ts|tsx|js|jsx|json)$/i.test(filename)) return false;
    // Skip generated/minified files
    if (/\.min\.(js|css)$/.test(filename)) return false;
    if (/\.generated\.|.pb\.|_pb2\.py$/.test(filename)) return false;
    // Skip type declaration files (auto-generated)
    if (/\.d\.ts$/.test(filename) && !filename.includes("global")) return false;
    if (READABLE_EXTENSIONS.has(filename)) return true; // Dockerfile, Makefile, etc.
    const ext = "." + filename.split(".").pop();
    return READABLE_EXTENSIONS.has(ext);
  });
}

/**
 * Fetch contents for a list of files, respecting the total char budget.
 * Fetches in parallel batches of 10 for speed.
 */
export async function fetchSelectedFiles(
  owner: string,
  repo: string,
  files: TreeFile[],
  token?: string
): Promise<FileContent[]> {
  const results: FileContent[] = [];
  let totalChars = 0;
  const BATCH_SIZE = 10;

  // Prioritize important source files first (actual code > config > everything else)
  const sorted = [...files].sort((a, b) => {
    const priority = (path: string) => {
      // Core source code gets top priority
      if (/\.(ts|tsx|py|go|rs|java|kt|swift|rb)$/.test(path)) return 0;
      if (/\.(js|jsx|mjs|cjs)$/.test(path)) return 1;
      if (/\.(c|cpp|h|hpp|cs)$/.test(path)) return 2;
      // Schema/API definitions
      if (/\.(prisma|graphql|gql|sql|proto)$/.test(path)) return 3;
      // Root package.json for dependency info
      if (/^package\.json$/.test(path)) return 4;
      // Shell scripts, Docker
      if (/\.(sh|bash)$/.test(path) || /Dockerfile|Makefile/.test(path)) return 5;
      // Styles/markup (least important)
      if (/\.(css|scss|html)$/.test(path)) return 6;
      return 7;
    };
    return priority(a.path) - priority(b.path);
  });

  for (let i = 0; i < sorted.length; i += BATCH_SIZE) {
    if (totalChars >= MAX_TOTAL_CHARS) break;
    const batch = sorted.slice(i, i + BATCH_SIZE);
    const fetched = await Promise.all(
      batch.map(async (file) => {
        const content = await fetchFileContent(owner, repo, file.path, token);
        return { path: file.path, content };
      })
    );
    for (const { path, content } of fetched) {
      if (totalChars >= MAX_TOTAL_CHARS) break;
      if (content.trim()) {
        // Skip files that are mostly embedded string data (e.g., seed/fixture files
        // with large template literals). These pollute LLM analysis context.
        const backtickCount = (content.match(/`/g) || []).length;
        const isDataHeavy = backtickCount > 50 && content.length > 3000;
        if (isDataHeavy) {
          // Include only the first 500 chars as a summary
          results.push({ path, content: content.slice(0, 500) + "\n// ... (large data file truncated)" });
          totalChars += 500;
        } else {
          results.push({ path, content });
          totalChars += content.length;
        }
      }
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
