# repo-intelligence — context for Claude Code

## What this repo is

Codebase intelligence for TypeScript repos: a compiler-built **symbol graph** plus **AST-aware RAG**, exposed as three commands — `impact` (blast radius), `map` (architecture diagram), `ask` (cited Q&A). GitHub: https://github.com/NivL1/repo-intelligence

It is the third of Niv's flagship public repos, after [`ai-pr-reviewer`](https://github.com/NivL1/ai-pr-reviewer) and [`nestjs-ai-starter`](https://github.com/NivL1/nestjs-ai-starter). Its service foundation (auth, Postgres, Redis, embeddings pipeline, Docker, CI) was **copied** from `nestjs-ai-starter` — deliberately not a GitHub fork, because a fork badge subordinates the repo, hides it from search, and doesn't count toward the contribution graph.

## The core design idea — don't re-litigate

Two indexes, because each is bad at what the other is good at:

- **Symbol graph** (`symbols` + `edges` tables) — built by the TypeScript compiler via `ts-morph`. Answers *structural* questions exactly: what calls this, what implements this. Deterministic.
- **Vector index** (`chunks` table, pgvector) — AST-aware chunks, one per function/method/class. Answers *conceptual* questions fuzzily.

`impact` and `map` use **only** the graph and never call an LLM, so their output is reproducible. Only `ask` involves an LLM. **Keep that distinction visible in output and docs** — it's a credibility feature, and it's the direct lesson from `ai-pr-reviewer`'s README once overselling unimplemented features.

Chosen `ts-morph` over tree-sitter: tree-sitter gives per-file syntax trees but no cross-file symbol resolution, which would mean hand-building import following, re-export chasing and interface matching. The TS compiler already does all of it, and `findReferences()` is built in. Multi-language is the only thing tree-sitter buys, and v1 is TypeScript-only on purpose.

## Git workflow

- `master` = stable/release. `develop` = integration. Feature work is `feat/*` or `fix/*` branched from `develop`, PR'd back into `develop`. `master` is only touched by release PRs.
- Conventional commits, split per logical unit of work.
- `ai-pr-reviewer` runs on every PR. **Read its comments before merging** — it produces real findings and also confident non-findings. On PR #9 of the starter it flagged a "race condition" its own analysis then disproved. Verify against the code before applying.
- Opening PRs with `gh pr create --base develop` sets the base correctly. The "check the base dropdown" caveat only applies to PRs created through the GitHub web UI, which defaults to `master`.

## Plan — 7 days

| Day | Scope | Branch |
| --- | ----- | ------ |
| 1 | Bootstrap: copy starter, strip demo search, graph schema, `POST /repositories` | `feat/bootstrap` |
| 2 | Symbol extraction via `ts-morph` → `symbols` + `edges` | `feat/symbol-graph` |
| 3 | `impact` — reverse-walk `calls` edges, group by module, find spec files | `feat/impact-analysis` |
| 4 | AST-aware chunking + embedding into `chunks` | `feat/ast-chunking` |
| 5 | `ask` — hybrid retrieval (vector + symbol + graph), pluggable LLM, citations | `feat/hybrid-ask` |
| 6 | `map` (Mermaid) + eval harness (20 questions, recall@5, MRR) | `feat/map-and-eval` |
| 7 | Docs, run on `nestjs-ai-starter` for real README output, release `v0.1.0` | `release/v0.1.0` |

**Out of v0.1.0 on purpose:** web UI, multi-language, incremental reindex, multi-repo. The UI is the first v0.2.0 item.

## Day 1 state (done)

Schema migration `1734000000000-CreateCodeGraphTables` creates `repositories`, `symbols`, `edges`, `chunks`. Notes worth keeping:

- `symbols.qualified_name` is intentionally **not** unique — overloads and same-named symbols across files legitimately collide; disambiguation is the caller's job.
- `IDX_edges_to_symbol` is the hot path, not `from_symbol_id` — blast radius walks edges *backwards*.
- `chunks.embedding` is `vector(EMBEDDING_DIMENSIONS)`, sized at migration time. Changing embeddings provider to one with different dimensions (onnx 384 / openai 1536 / ollama 768) requires re-running the migration and re-indexing.
- ivfflat index uses `lists = 1` — the only safe value on an index built before data exists. Bump toward sqrt(row count) and REINDEX once a real corpus lands.

`WorkspaceService` shells out to git. Two invariants: arguments always go through `execFile`'s array form (never a shell string), and remote sources are **https:// only** — git's `ext::` transport helper executes arbitrary commands on clone, and `ssh://`/`file://` would reach host credentials and local files.

The Dockerfile runtime stage installs `git` explicitly; `node:20-slim` ships without it and cloning would fail at runtime otherwise. The base image is `-slim` rather than `-alpine` because `onnxruntime-node` needs glibc.

## Environment

```bash
cp .env.example .env
docker compose up
```

Swagger at `http://localhost:3000/docs`. `WORKSPACE_DIR` (default `./.workspace`) is where cloned repos land; it's gitignored and dockerignored.

Embeddings default to `onnx` (local `all-MiniLM-L6-v2`, 384 dims, no API key). `stub` exists for fast tests only and produces vectors with **no semantic meaning** — never benchmark retrieval with it.
