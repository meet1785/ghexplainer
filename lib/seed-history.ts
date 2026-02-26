/**
 * Seed history data — concise demo analysis results for first-visit UX.
 * Kept small to avoid polluting LLM analysis context if this repo is analyzed.
 */

import type { SavedAnalysis } from "./history";

export const SEED_ANALYSES: Omit<SavedAnalysis, "id" | "savedAt">[] = [
  {
    url: "https://github.com/ai/nanoid",
    repoSlug: "ai/nanoid",
    description: "A tiny, secure, URL-friendly, unique string ID generator for JavaScript",
    language: "JavaScript",
    stars: 25000,
    filesAnalyzed: 12,
    chunks: 2,
    durationMs: 95000,
    complete: true,
    markdown: `# 1. Repository Overview

\`nanoid\` is a minimalist, secure, URL-friendly unique string ID generator for JavaScript. At just 118 bytes (minified), it provides cryptographically strong random IDs using \`crypto.getRandomValues\` in both Node.js and browser environments. The default alphabet (\`A-Za-z0-9_-\`) produces URL-safe IDs without encoding.

Key features: tiny size, CSPRNG-based security, URL-safe output, customizable alphabets via \`customAlphabet()\`, and a non-secure \`Math.random()\` fallback for performance-critical non-security contexts. Includes CLI via \`bin/nanoid.js\`.

# 2. Architecture & Design

Utility library architecture with environment-specific entry points:
- \`index.js\` — Node.js secure implementation with byte pooling optimization
- \`index.browser.js\` — Browser implementation using \`window.crypto\`
- \`non-secure/index.js\` — Fast \`Math.random()\` alternative
- \`url-alphabet/index.js\` — Shared default alphabet (\`A-Za-z0-9_-\`)
- \`bin/nanoid.js\` — CLI entry point

# 3. Module Breakdown

- **Core modules** (\`index.js\`, \`index.browser.js\`): Export \`nanoid()\`, \`customAlphabet()\`, \`customRandom()\`. Use bitwise operations (\`byte & 63\`) for efficient alphabet mapping.
- **Non-secure** (\`non-secure/index.js\`): Same API but uses \`Math.random()\` — faster, not cryptographically secure.
- **URL Alphabet** (\`url-alphabet/index.js\`): Exports the 64-character URL-safe alphabet string.
- **CLI** (\`bin/nanoid.js\`): Accepts \`--size\` and \`--alphabet\` flags, prints generated ID to stdout.

# 4. Core Execution Flow

1. User calls \`nanoid(size?)\` or \`customAlphabet(alphabet, size)()\`
2. Function calculates required random bytes based on alphabet size
3. Secure random bytes obtained via \`crypto.getRandomValues()\` (Node.js uses pooled \`Buffer.allocUnsafe\`)
4. Bytes mapped to alphabet indices using bitwise masking (\`byte & mask\`)
5. Characters concatenated into final ID string and returned

# 5. API Surface

- \`nanoid(size?: number): string\` — Generate URL-safe ID (default 21 chars)
- \`customAlphabet(alphabet: string, size?: number): () => string\` — Factory for custom alphabet generator
- \`customRandom(random: Function, alphabet: string, size?: number): () => string\` — Full customization
- CLI: \`npx nanoid [--size N] [--alphabet CHARS]\`

# 6. Key Business Logic

Byte pooling in Node.js (\`index.js\`): Pre-allocates a large \`Buffer\` of random bytes to minimize \`crypto.getRandomValues\` syscalls. Pool refilled when depleted. This is the main performance optimization.

Alphabet mapping uses \`Math.clz32\` to compute optimal bitmask for non-power-of-2 alphabets, with rejection sampling to ensure uniform distribution.

# 7. Data Flow & State Management

Stateless library — no persistence or external state. Only internal state is the Node.js random byte pool (module-level \`Buffer\`). Custom generators use closures to capture configuration.

# 8. Configuration & Environment

No env vars or config files needed. Automatically detects Node.js vs browser for the appropriate crypto API. Requires ES Module support or compatible bundler.

# 9. Dependencies & Tech Stack

Zero runtime dependencies. Uses only built-in \`node:crypto\` (Node.js) or \`window.crypto\` (browser). Dev dependencies include benchmarking tools.

# 10. Strengths & Weaknesses

**Strengths:** Extremely small footprint (118B), zero dependencies, secure by default, excellent performance via byte pooling, clean API design.

**Weaknesses:** No built-in collision detection, limited to single-unit output, non-secure fallback requires explicit opt-in import path.

# 11. Quick Reference

- Entry: \`index.js\` (Node), \`index.browser.js\` (browser), \`non-secure/index.js\` (fast)
- Default ID length: 21 characters from \`A-Za-z0-9_-\`
- Collision probability: ~1 billion IDs needed for 1% chance at default settings
- Byte pool size: 128 × size multiplier in Node.js implementation
- CLI: \`bin/nanoid.js\` with \`--size\` and \`--alphabet\` options`,
  },
  {
    url: "https://github.com/lukeed/kleur",
    repoSlug: "lukeed/kleur",
    description: "The fastest Node.js library for formatting terminal text with ANSI colors",
    language: "JavaScript",
    stars: 1700,
    filesAnalyzed: 6,
    chunks: 1,
    durationMs: 78000,
    complete: true,
    markdown: `# 1. Repository Overview

\`kleur\` is a high-performance Node.js library for applying ANSI color codes to terminal text. It prioritizes speed and minimal footprint over feature richness, consistently outperforming alternatives like \`chalk\` in benchmarks. Supports basic colors, backgrounds, and modifiers (bold, italic, underline, etc.) with automatic \`NO_COLOR\` environment variable support.

# 2. Architecture & Design

Single-module library with two entry points:
- \`kleur/index.mjs\` — Chained API: \`kleur.red().bold("text")\`
- \`kleur/colors.mjs\` — Tagged function API: \`colors.red(colors.bold("text"))\`

Both wrap text with ANSI escape codes and handle nested style resets via string replacement.

# 3. Module Breakdown

- **\`index.mjs\`**: Main chained API. Uses \`init()\` to create style objects with getter-based chaining.
- **\`colors.mjs\`**: Standalone function API. Each color/modifier is an independent function.
- **\`index.d.ts\`**: TypeScript definitions for both APIs.
- **Shared logic**: ANSI code pairs (open/close), \`enabled\` flag controlled by \`NO_COLOR\`/\`FORCE_COLOR\` env vars.

# 4. Core Execution Flow

1. User calls e.g. \`kleur.red().bold("text")\`
2. \`.red()\` getter creates new context with red ANSI open/close codes
3. \`.bold("text")\` wraps text with bold + red codes
4. Nested styles handled by replacing inner close codes with close+reopen

# 5. API Surface

- \`kleur.<color>(text?)\` — Apply color (red, green, blue, cyan, etc.)
- \`kleur.<modifier>(text?)\` — Apply modifier (bold, dim, italic, underline, etc.)
- \`kleur.<bg>(text?)\` — Apply background (bgRed, bgGreen, etc.)
- \`kleur.enabled\` — Boolean to enable/disable color output
- \`colors.<fn>(text)\` — Standalone function API

# 6. Key Business Logic

Nesting uses \`run()\` helper with regex to replace inner close codes, preventing style bleeding when nesting different colors.

# 7. Data Flow & State Management

Stateless per call. The \`enabled\` flag is the only mutable state. No caching or persistence.

# 8. Configuration & Environment

\`NO_COLOR\` env var disables color output. \`FORCE_COLOR\` forces it. Requires Node.js v6+.

# 9. Dependencies & Tech Stack

Zero runtime dependencies. Pure JavaScript with ESM exports.

# 10. Strengths & Weaknesses

**Strengths:** Fastest in class, zero deps, tiny size (~330B), clean dual API, proper \`NO_COLOR\` support.
**Weaknesses:** No 256/RGB color support, no template literal API.

# 11. Quick Reference

- Two APIs: chained (\`kleur.red().bold()\`) and standalone (\`colors.red()\`)
- ANSI codes defined as [open, close] pairs
- \`NO_COLOR\` / \`FORCE_COLOR\` env vars control output
- ~330 bytes, zero dependencies, 2-10x faster than chalk`,
  },
  {
    url: "https://github.com/lukeed/ms",
    repoSlug: "lukeed/ms",
    description: "Tiny millis-to-and-from-string utility",
    language: "JavaScript",
    stars: 900,
    filesAnalyzed: 4,
    chunks: 1,
    durationMs: 82000,
    complete: true,
    markdown: `# 1. Repository Overview

\`@lukeed/ms\` is a tiny (414 bytes) JavaScript utility for converting between milliseconds and human-readable time strings like "2 days", "1.5h", "100ms". Designed as a faster, smaller alternative to \`zeit/ms\`. Provides both \`parse()\` (string to ms) and \`format()\` (ms to string) functions.

# 2. Architecture & Design

Minimal utility module with a single source file (\`src/index.js\`) exporting two pure functions. TypeScript definitions in \`index.d.ts\`.

# 3. Module Breakdown

- **\`src/index.js\`**: Core implementation with \`parse()\` and \`format()\`.
- **\`index.d.ts\`**: TypeScript types.
- **\`bench/index.js\`**: Performance comparison against \`zeit/ms\`.

# 4. Core Execution Flow

**parse("2.5h")**: Regex extracts value (2.5) and unit (h), multiplied by unit ms equivalent, returns 9000000.
**format(9000000)**: Cascades through units (d, h, m, s, ms), finds largest fitting unit, returns "2.5 hours".

# 5. API Surface

- \`parse(input: string): number | undefined\` — Convert time string to ms
- \`format(ms: number): string\` — Convert ms to human-readable string

# 6. Key Business Logic

Parse uses complex regex for matching value+unit pairs. Format uses bitwise rounding trick: \`~~(val + 0.5)\` (faster than Math.round).

# 7. Data Flow & State Management

Completely stateless. Both functions are pure with no side effects.

# 8. Configuration & Environment

No configuration needed. Works in any JS environment.

# 9. Dependencies & Tech Stack

Zero runtime dependencies.

# 10. Strengths & Weaknesses

**Strengths:** 414 bytes, zero deps, fast, clean API, TypeScript support.
**Weaknesses:** Single-unit output only ("1.5 hours" not "1h 30m"), complex regex.

# 11. Quick Reference

- Two exports: \`parse(str)\` and \`format(ms)\`
- Supports: ms, s/sec, m/min, h/hr, d/day, w/week, y/year
- 414 bytes minified, zero dependencies
- \`parse\` returns \`undefined\` for invalid input`,
  },
  {
    url: "https://github.com/sindresorhus/is-online",
    repoSlug: "sindresorhus/is-online",
    description: "Check if the internet connection is up",
    language: "JavaScript",
    stars: 1200,
    filesAnalyzed: 3,
    chunks: 1,
    durationMs: 72000,
    complete: true,
    markdown: `# 1. Repository Overview

\`is-online\` is a simple Node.js utility that checks whether the machine has an active internet connection. It works by performing DNS lookups against well-known public DNS servers and optionally checking reachability of specific domains. Useful for CLI tools, desktop apps, or services that need to gracefully handle offline scenarios.

# 2. Architecture & Design

Single-module utility pattern. The main export is an async function that runs multiple connectivity checks in parallel and returns \`true\` if any succeed. Uses a race pattern for fast resolution.

# 3. Module Breakdown

- **\`index.js\`**: Main module exporting \`isOnline(options?)\`. Uses \`dns.promises.resolve\` and \`net.Socket\` connections.
- **\`index.d.ts\`**: TypeScript definitions with \`Options\` interface.

# 4. Core Execution Flow

1. User calls \`await isOnline(options?)\`
2. Spawns parallel DNS resolution attempts to public servers (1.1.1.1, 8.8.8.8)
3. Optional TCP socket connection to configurable domains on port 443
4. First successful response resolves as \`true\`
5. If all checks fail within timeout, resolves as \`false\`

# 5. API Surface

- \`isOnline(options?): Promise<boolean>\`
  - \`options.timeout\` — Timeout in ms (default: 5000)
  - \`options.ipVersion\` — Force IPv4 or IPv6

# 6. Key Business Logic

Uses \`Promise.any()\` over multiple DNS/TCP probes — first success wins. Each probe has individual timeout via \`AbortController\`. Fallback chain: DNS resolution then TCP socket then return false.

# 7. Data Flow & State Management

Stateless. Each call creates fresh network connections with proper cleanup via abort signals.

# 8. Configuration & Environment

No env vars required. Works on any platform with Node.js. Firewall rules may affect results.

# 9. Dependencies & Tech Stack

Uses Node.js built-in \`dns\`, \`net\`, and \`timers\` modules. Minimal external dependencies.

# 10. Strengths & Weaknesses

**Strengths:** Simple API, parallel checks, configurable timeout, IPv4/IPv6 support, proper abort cleanup.
**Weaknesses:** Cannot distinguish "no internet" from "DNS blocked", no caching, relies on third-party DNS.

# 11. Quick Reference

- Single async function: \`isOnline(options?)\` returning \`Promise<boolean>\`
- Checks DNS against public servers (1.1.1.1, 8.8.8.8)
- Uses \`Promise.any()\` for first-success resolution
- Default timeout: 5000ms
- Supports IPv4/IPv6 selection`,
  },
];
