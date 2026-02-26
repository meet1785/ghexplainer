/**
 * Seed history data — hardcoded analysis results for demo/testing.
 * These populate the history panel on first visit so users can see real output.
 */

import type { SavedAnalysis } from "./history";

export const SEED_ANALYSES: Omit<SavedAnalysis, "id" | "savedAt">[] = [
  {
    url: "https://github.com/sindresorhus/is",
    repoSlug: "sindresorhus/is",
    description: "Type check values",
    language: "TypeScript",
    stars: 1700,
    filesAnalyzed: 8,
    chunks: 2,
    durationMs: 22400,
    complete: true,
    markdown: `# 1. Repository Overview

**sindresorhus/is** is a comprehensive TypeScript type-checking utility library. It provides 50+ type guard functions (\`is.string()\`, \`is.promise()\`, \`is.plainObject()\`, etc.) that return \`boolean\` and also serve as TypeScript type predicates, narrowing types in conditional branches. Target users: any TypeScript/JavaScript developer who needs runtime type checking with full type inference.

# 2. Architecture & Design

**Single-module library** — everything lives in \`source/is.ts\` (the main barrel) backed by individual type-check implementations. No build step beyond \`tsc\`. Ships as ESM-only.

Backbone files:
- \`source/is.ts\` — main export, assembles all checks into the \`is\` namespace object
- \`source/types.ts\` — shared TypeScript type definitions and branded types
- \`source/assertions.ts\` — \`assert.*\` variants that throw on failure

# 3. Module Breakdown

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| \`source/is.ts\` | Core type guards | \`is.string\`, \`is.number\`, \`is.array\`, \`is.promise\`, \`is.plainObject\`, ~50 more |
| \`source/types.ts\` | Type definitions | \`Predicate\`, \`TypeName\`, branded types for primitives |
| \`source/assertions.ts\` | Assert wrappers | \`assert.string()\` — throws \`TypeError\` if check fails |

# 4. Core Execution Flow

1. User imports \`is\` from package
2. Calls \`is.string(value)\` → executes type guard in \`source/is.ts\`
3. Type guard uses \`typeof\`, \`instanceof\`, \`Symbol.toStringTag\`, or custom logic
4. Returns \`boolean\` + narrows TypeScript type via \`value is string\` predicate
5. For \`assert.string(value)\` → wraps the guard, throws \`TypeError\` with descriptive message on failure

# 5. API Surface

| Function | Input | Output | Notes |
|----------|-------|--------|-------|
| \`is.string(v)\` | \`unknown\` | \`v is string\` | \`typeof\` check |
| \`is.number(v)\` | \`unknown\` | \`v is number\` | Excludes \`NaN\` |
| \`is.plainObject(v)\` | \`unknown\` | \`v is Record<string, unknown>\` | Checks prototype chain |
| \`is.promise(v)\` | \`unknown\` | \`v is Promise<unknown>\` | Checks \`.then\` callable |
| \`is.array(v, guard?)\` | \`unknown, Predicate?\` | \`v is T[]\` | Optional element guard |
| \`assert.string(v)\` | \`unknown\` | \`void\` (throws) | \`TypeError\` on failure |

# 6. Key Business Logic

- **\`is.plainObject()\`** in \`source/is.ts\`: Uses \`Object.getPrototypeOf()\` chain walking to distinguish plain \`{}\` from class instances. Handles \`Object.create(null)\` edge case.
- **\`is.observable()\`**: Checks for \`Symbol.observable\` — cross-library interop pattern.
- **Type branding**: Uses TypeScript's branded types pattern (\`string & { __brand: 'Url' }\`) for refined types like \`is.urlString()\`.

# 7. Data Flow & State Management

Stateless library — no caching, persistence, or side effects. Pure functions only. No external service calls.

# 8. Configuration & Environment

- **Node.js ≥ 18** required (ESM-only)
- No env vars or config files needed
- \`package.json\` \`exports\` field maps entry points

# 9. Dependencies & Tech Stack

**Zero runtime dependencies.** Dev dependencies: \`ava\` (testing), \`tsd\` (type testing), \`xo\` (linting). This is intentional — a type-check library should add no transitive deps.

# 10. Strengths & Weaknesses

**Strengths:**
- Exhaustive type coverage with TypeScript predicates — eliminates \`as\` casts
- Zero deps, tiny bundle size
- \`assert.*\` API gives both check + throw patterns

**Weaknesses:**
- Some checks have edge cases with cross-realm objects (iframes)
- No tree-shaking at function level — importing \`is\` brings everything
- ESM-only may break older CJS codebases

# 11. Quick Reference

- 50+ type guard functions in a single \`is\` namespace
- All guards are TypeScript type predicates (\`value is T\`)
- \`assert.*\` variants throw \`TypeError\` on failure
- Zero runtime dependencies
- ESM-only, Node ≥ 18
- Handles edge cases: \`NaN\`, \`null\` prototype objects, cross-realm
- Branded types for refined checks (\`is.urlString\`, \`is.numericString\`)
- Main logic: \`source/is.ts\` (~800 lines)
- Pure functions, fully stateless
- Tests via \`ava\` + \`tsd\` for type-level testing`,
  },
  {
    url: "https://github.com/tj/commander.js",
    repoSlug: "tj/commander.js",
    description: "The complete solution for node.js command-line interfaces.",
    language: "JavaScript",
    stars: 27000,
    filesAnalyzed: 14,
    chunks: 3,
    durationMs: 45200,
    complete: true,
    markdown: `# 1. Repository Overview

**commander.js** is the de facto standard CLI framework for Node.js. It provides a fluent API for defining commands, options, arguments, and help text. Used by thousands of packages (next, webpack-cli, etc.) to build command-line tools. Core value: turn \`process.argv\` into structured, validated, documented CLI programs with minimal boilerplate.

# 2. Architecture & Design

**Single-package monolith** with a class-based OOP design:

\`\`\`
process.argv → Command.parse() → Option/Argument matching → Action handler → Output
\`\`\`

Backbone files:
- \`lib/command.js\` — \`Command\` class (core: parsing, subcommands, help)
- \`lib/option.js\` — \`Option\` class (flag definition, parsing, validation)
- \`lib/argument.js\` — \`Argument\` class (positional args)
- \`lib/help.js\` — \`Help\` class (auto-generated help text formatting)
- \`lib/error.js\` — \`CommanderError\` for graceful exit handling
- \`index.js\` — barrel export + singleton \`program\` instance

# 3. Module Breakdown

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| \`lib/command.js\` | Core CLI engine | \`Command\` — define commands, parse argv, invoke actions |
| \`lib/option.js\` | Option definitions | \`Option\` — flags, defaults, env vars, choices, conflicts |
| \`lib/argument.js\` | Positional args | \`Argument\` — name, required/optional, variadic, choices |
| \`lib/help.js\` | Help text generator | \`Help\` — formats usage, options, commands into columns |
| \`lib/error.js\` | Error handling | \`CommanderError\`, \`InvalidArgumentError\` |
| \`index.js\` | Entry point | Singleton \`program\`, re-exports all classes |

# 4. Core Execution Flow

1. **Define**: \`program.option('-p, --port <number>')\` → creates \`Option\` instance, stores in \`Command._options[]\`
2. **Parse**: \`program.parse(process.argv)\` → \`Command._parseCommand()\`
3. **Tokenize**: Splits argv into known options, operands, unknown → \`Command.parseOptions()\`
4. **Validate**: Checks required options, conflicts, choices → \`_checkForMissingMandatoryOptions()\`
5. **Route**: Matches subcommand or invokes \`.action()\` handler → \`Command._dispatchSubcommand()\`
6. **Execute**: Calls user's action fn with parsed args + options object
7. **Help**: If \`--help\` detected, \`Help.formatHelp()\` generates text, \`process.stdout.write()\`, exit

# 5. API Surface

| Method | Input | Output | Notes |
|--------|-------|--------|-------|
| \`.command(name)\` | string | \`Command\` | Add subcommand |
| \`.option(flags, desc)\` | string, string | \`Command\` | Define option flag |
| \`.argument(name, desc)\` | string, string | \`Command\` | Define positional arg |
| \`.action(fn)\` | callback | \`Command\` | Set command handler |
| \`.parse(argv?)\` | string[]? | \`Command\` | Parse and execute |
| \`.parseAsync(argv?)\` | string[]? | \`Promise<Command>\` | Async version |
| \`.opts()\` | — | object | Get parsed options |
| \`.help()\` | — | void (exits) | Display help and exit |

# 6. Key Business Logic

- **\`Command.parseOptions()\`** in \`lib/command.js\`: The core argv parser. Handles combined short opts (\`-abc\`), \`--no-*\` negation, \`=\` value syntax, and stops at \`--\`. ~150 lines of careful string manipulation.
- **\`Help.formatHelp()\`** in \`lib/help.js\`: Auto-generates aligned column output. Calculates padding widths, wraps long descriptions, handles term width detection.
- **Option conflicts/implies**: \`Option.conflicts()\` and \`Option.implies()\` create dependency graphs between options, validated at parse time.
- **Subcommand dispatch**: Supports both action-based (\`.action(fn)\`) and standalone-executable (\`git-clone\` pattern) subcommands via \`_dispatchSubcommand()\`.

# 7. Data Flow & State Management

Stateful: the \`Command\` instance accumulates state during definition (options, args, subcommands) and during parsing (values, matched commands). Key state containers:
- \`Command._options: Option[]\` — registered options
- \`Command._args: Argument[]\` — registered positional args  
- \`Command.commands: Command[]\` — subcommand tree
- \`Command._optionValues: Record<string, any>\` — parsed option values

No persistence, no caching. All state lives in-memory per parse cycle.

# 8. Configuration & Environment

- Node.js ≥ 16
- No env vars required (but options can read from env via \`.env()\`)
- \`package.json\` exports both CJS and ESM entry points
- TypeScript types bundled in \`typings/index.d.ts\`

# 9. Dependencies & Tech Stack

**Zero runtime dependencies.** Dev: \`jest\` for testing, \`@types/node\`. The zero-dep approach is deliberate for a foundational CLI package.

# 10. Strengths & Weaknesses

**Strengths:**
- Battle-tested: 27k stars, used by 100k+ packages
- Complete CLI feature set: subcommands, auto-help, version, error handling
- Zero deps, CJS+ESM dual-publish
- Fluent chainable API is intuitive

**Weaknesses:**
- Mutable OOP design can lead to subtle ordering bugs
- Global singleton \`program\` pattern is convenient but complicates testing
- Help formatting is tightly coupled — hard to customize layout without subclassing
- No built-in argument coercion for common types (numbers, booleans)

# 11. Quick Reference

- Core class: \`Command\` in \`lib/command.js\` — the entire CLI engine
- Fluent API: chain \`.option()\`, \`.argument()\`, \`.command()\`, \`.action()\`, \`.parse()\`
- Zero runtime dependencies
- \`program\` singleton exported for quick scripts
- \`parseOptions()\` is the core argv tokenizer (~150 LOC)
- Supports subcommand trees (nested \`Command\` instances)
- Auto-generates \`--help\` via \`Help.formatHelp()\`
- \`--no-*\` prefix auto-creates boolean negation
- Both CJS and ESM entry points
- Options can read from env vars via \`.env('VAR_NAME')\``,
  },
  {
    url: "https://github.com/expressjs/express",
    repoSlug: "expressjs/express",
    description: "Fast, unopinionated, minimalist web framework for Node.js",
    language: "JavaScript",
    stars: 65000,
    filesAnalyzed: 18,
    chunks: 4,
    durationMs: 58700,
    complete: true,
    markdown: `# 1. Repository Overview

**Express** is the most widely used HTTP server framework for Node.js. It provides a thin layer over Node's built-in \`http\` module — routing, middleware pipeline, request/response utilities — without imposing opinions on structure, templating, or ORM. Core value: minimal boilerplate to go from \`require('express')\` to a production HTTP server.

# 2. Architecture & Design

**Middleware pipeline architecture** — the defining pattern:

\`\`\`
HTTP Request → app (Application) → Router → Route → Middleware chain → Handler → Response
\`\`\`

Backbone files:
- \`lib/express.js\` — factory function, creates \`app\`
- \`lib/application.js\` — \`app\` prototype: \`.use()\`, \`.listen()\`, settings
- \`lib/router/index.js\` — \`Router\`: URL matching, middleware dispatch
- \`lib/router/route.js\` — \`Route\`: method-specific handler chain per path
- \`lib/router/layer.js\` — \`Layer\`: single middleware/route match unit
- \`lib/request.js\` — Extended \`req\` object (params, query, body, etc.)
- \`lib/response.js\` — Extended \`res\` object (.json(), .send(), .redirect(), etc.)

# 3. Module Breakdown

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| \`lib/express.js\` | Entry point | \`createApplication()\` factory |
| \`lib/application.js\` | App core | \`app.use()\`, \`app.get/post/...()\`, \`app.listen()\`, \`app.set()\` |
| \`lib/router/index.js\` | Router engine | \`Router()\` — URL matching, ordered middleware dispatch |
| \`lib/router/route.js\` | Route container | \`Route\` — per-path method handlers |
| \`lib/router/layer.js\` | Match unit | \`Layer\` — wraps a single middleware fn + path regex |
| \`lib/request.js\` | Req extensions | \`req.params\`, \`req.query\`, \`req.body\`, \`req.get()\` |
| \`lib/response.js\` | Res extensions | \`res.json()\`, \`res.send()\`, \`res.status()\`, \`res.redirect()\` |
| \`lib/middleware/init.js\` | Bootstrap | Sets up \`req.res\`, \`res.req\` cross-references |
| \`lib/utils.js\` | Helpers | Content-type negotiation, ETag generation |

# 4. Core Execution Flow

1. \`express()\` → \`createApplication()\` in \`lib/express.js\` → returns \`app\` function
2. \`app.use(cors())\` → pushes middleware \`Layer\` into \`app._router.stack[]\`
3. \`app.get('/users', handler)\` → creates \`Route\` → adds \`Layer\` with method filter
4. \`app.listen(3000)\` → \`http.createServer(app).listen()\`
5. HTTP request arrives → \`app.handle(req, res)\`
6. \`Router.handle()\` → iterates \`stack[]\`, matches \`Layer.match(path)\`
7. Matching layer: calls \`layer.handle_request(req, res, next)\`
8. \`next()\` advances to next matching layer or calls final handler
9. \`res.json({ data })\` → serializes, sets headers, calls \`res.end()\`

# 5. API Surface

| Method | Input | Output | Notes |
|--------|-------|--------|-------|
| \`express()\` | — | \`app\` | Create application |
| \`app.use(path?, ...fns)\` | middleware | \`app\` | Mount middleware |
| \`app.get/post/put/delete(path, ...fns)\` | route + handlers | \`app\` | Route registration |
| \`app.listen(port, cb?)\` | number | \`http.Server\` | Start server |
| \`app.set(key, val)\` | string, any | \`app\` | App settings |
| \`req.params\` | — | object | URL parameters |
| \`req.query\` | — | object | Query string parsed |
| \`res.json(body)\` | any | \`res\` | JSON response |
| \`res.send(body)\` | string/Buffer/obj | \`res\` | Auto content-type |
| \`res.status(code)\` | number | \`res\` | Set status code |
| \`Router()\` | options? | \`Router\` | Standalone router |

# 6. Key Business Logic

- **\`Router.handle()\`** in \`lib/router/index.js\`: The middleware dispatch loop. Iterates \`this.stack\`, calls \`layer.match()\`, handles \`next()\`/\`next(err)\` flow control, error middleware detection (4 args). ~200 lines, the heart of Express.
- **\`Layer.match()\`** in \`lib/router/layer.js\`: Compiles path patterns to regex via \`path-to-regexp\`, extracts \`req.params\`.
- **\`res.send()\`** in \`lib/response.js\`: Content negotiation — detects Buffer/string/object, sets Content-Type, generates ETag, handles HEAD requests. ~80 lines of careful HTTP semantics.

# 7. Data Flow & State Management

- **Request lifecycle**: Node \`IncomingMessage\` → extended with Express properties (\`params\`, \`query\`, \`body\`) → passed through middleware chain → response sent
- **App settings**: \`app.settings\` object (view engine, env, trust proxy, etc.) — mutable via \`app.set()\`
- **No persistence**: Express itself stores nothing. State management is delegated to middleware (session, body-parser, etc.)

# 8. Configuration & Environment

- \`NODE_ENV\` — detected via \`app.get('env')\`, affects error detail in responses
- \`trust proxy\` — setting for reverse proxy IPs
- No config files — everything via \`app.set()\` calls

# 9. Dependencies & Tech Stack

Key runtime deps: \`path-to-regexp\` (URL pattern matching), \`qs\` (query parsing), \`content-disposition\`, \`cookie\`, \`send\` (static files), \`finalhandler\` (default error handler). Deliberately minimal — the framework is ~1600 LOC.

# 10. Strengths & Weaknesses

**Strengths:**
- Minimal, composable middleware pattern — infinitely extensible
- Massive ecosystem: 10k+ middleware packages
- ~1600 LOC core — readable and maintainable
- Battle-hardened: 65k stars, billions of requests served

**Weaknesses:**
- No built-in async error handling (requires \`express-async-errors\` or manual try/catch)
- \`path-to-regexp\` version is outdated in Express 4.x (security patches needed)
- Callback-based API shows its age vs. modern async/await frameworks
- No TypeScript — types are community-maintained \`@types/express\`
- Template engine integration assumes server-side rendering (less relevant for API-only apps)

# 11. Quick Reference

- Entry: \`express()\` factory returns \`app\` function (also an HTTP handler)
- Middleware pattern: \`app.use(fn(req, res, next))\` — the core abstraction
- Router dispatch loop: \`lib/router/index.js:Router.handle()\` — ~200 LOC
- \`res.send()\` does content negotiation, ETag, encoding automatically
- Error middleware: 4-arg function \`(err, req, res, next)\`
- Path matching via \`path-to-regexp\` (regex compilation)
- ~1600 LOC total — intentionally minimal
- Settings via \`app.set()\`, env via \`NODE_ENV\`
- Zero opinion on structure, ORM, or templating
- Middleware order matters — \`app.use()\` is sequential`,
  },
];
