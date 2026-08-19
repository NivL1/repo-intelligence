# repo-intelligence

Codebase intelligence for TypeScript repositories. It builds two indexes of a repo — a **symbol graph** from the TypeScript compiler, and **AST-aware embeddings** in pgvector — and answers questions against both.

The point of the split: the compiler answers structural questions exactly (*what calls this?*), and embeddings answer conceptual ones (*how does auth work?*). Neither does the other job well.

## Planned commands

| Command | Question | LLM involved |
| ------- | -------- | ------------ |
| `impact` | "What breaks if I change this function?" | No — graph traversal only |
| `map`    | "Draw me this project's architecture" | No — graph traversal only |
| `ask`    | "How does semantic search work here?" | Yes — hybrid retrieval, then an LLM |

Two of the three never touch an LLM, so their answers are reproducible rather than probabilistic. That distinction is deliberate and is surfaced in the output.

## Status

Early — v0.1.0 is in progress. What actually works today:

- [x] **Repository registration** — clone an https:// git URL or reference a local checkout, tracked through a `pending → indexing → ready` lifecycle
- [x] **Symbol graph extraction** — `POST /repositories/:id/index` parses a TypeScript project with the compiler (via `ts-morph`) and records every class, method, function and interface, plus the `calls` / `implements` / `extends` / NestJS constructor-`injects` edges between them
- [x] Schema for `repositories`, `symbols`, `edges`, `chunks`
- [x] Inherited foundation: JWT auth, Postgres, Redis, pluggable embeddings (local ONNX by default), Docker, CI, Swagger
- [x] **`impact`** — `GET /repositories/:id/impact?symbol=X` reverse-walks the call graph for direct and transitive callers, the modules they live in, and spec files that may cover them (by filename convention — see below). No LLM.
- [x] **AST-aware chunking and embedding** — `POST /repositories/:id/index` also chunks every method/function/interface (one chunk per symbol, full source + a context header, not an arbitrary character slice) and embeds it via the pluggable embeddings pipeline. Classes aren't chunked as their own unit — see [docs](#chunking) below.
- [x] **`ask`** — `POST /repositories/:id/ask` — hybrid retrieval (vector similarity + exact symbol match + one hop of call-graph expansion) feeds an LLM, which answers using only the retrieved excerpts and cites which one backs each claim.
- [ ] `map` — Mermaid architecture diagrams (Day 6)
- [ ] Retrieval eval harness (Day 6)

Nothing above the line is aspirational; nothing below it is implemented yet.

## Built on

The service foundation — auth, database, Redis, the pluggable embeddings pipeline, Docker and CI — comes from [nestjs-ai-starter](https://github.com/NivL1/nestjs-ai-starter), a production-grade NestJS starter with a built-in pgvector RAG module. This repo is what that starter exists to make possible.

## Stack

- **NestJS 10** + TypeScript
- **Postgres** + **pgvector** — both the relational graph tables and the vector index
- **Redis** — embedding and LLM-completion cache
- **ts-morph** — the TypeScript compiler API, for symbol resolution
- **@xenova/transformers** — local ONNX embeddings, no API key required
- **Ollama** — local LLM for `ask`, no API key required; OpenAI is a configurable option

## Running it

```bash
cp .env.example .env
docker compose up
```

Swagger UI is at `http://localhost:3000/docs`.

To register a repository for analysis:

```bash
curl -X POST http://localhost:3000/repositories \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"source": "https://github.com/NivL1/nestjs-ai-starter"}'
```

Remote sources must be `https://` — see [WorkspaceService](src/repositories/workspace.service.ts) for why other git transports are rejected.

Then index it:

```bash
curl -X POST http://localhost:3000/repositories/$REPO_ID/index \
  -H "Authorization: Bearer $TOKEN"
```

Real output from running this against [nestjs-ai-starter](https://github.com/NivL1/nestjs-ai-starter) itself:

```json
{
  "repository": { "name": "NivL1/nestjs-ai-starter", "status": "ready", "indexedCommit": "7822fa7…" },
  "symbolsExtracted": 78,
  "edgesDiscovered": 31,
  "chunksEmbedded": 46
}
```

And the compiler correctly resolved every one of that repo's NestJS dependency-injection edges, including one typed as an interface rather than a concrete class:

```
SearchService          --injects--> EmbeddingCacheService
EmbeddingCacheService  --injects--> EmbeddingsProvider   (an interface, not a class)
AuthService            --injects--> UsersService
```

Then ask what breaks if you change something:

```bash
curl "http://localhost:3000/repositories/$REPO_ID/impact?symbol=EmbeddingCacheService.embed" \
  -H "Authorization: Bearer $TOKEN"
```

Real output — direct callers at depth 1, their own callers at depth 2, correctly scoped to one module, and both real spec files that actually cover this code path:

```json
{
  "symbol": { "qualifiedName": "EmbeddingCacheService.embed", "filePath": "src/embeddings/embedding-cache.service.ts" },
  "callers": [
    { "symbol": { "qualifiedName": "SearchService.ingest" }, "depth": 1 },
    { "symbol": { "qualifiedName": "SearchService.search" }, "depth": 1 },
    { "symbol": { "qualifiedName": "SearchController.ingest" }, "depth": 2 },
    { "symbol": { "qualifiedName": "SearchController.search" }, "depth": 2 }
  ],
  "affectedModules": ["search"],
  "relatedTests": ["src/embeddings/embedding-cache.service.spec.ts", "src/search/search.service.spec.ts"]
}
```

If a symbol name matches more than one thing (overloads, or same name in different files), the API returns `409 Conflict` with every candidate's id instead of guessing — retry with `symbolId` instead of `symbol`.

## Ask

```bash
curl -X POST http://localhost:3000/repositories/$REPO_ID/ask \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"question": "How does semantic search work in this project?"}'
```

Retrieval pulled the genuinely correct 10 excerpts against `nestjs-ai-starter` — `SearchService.search`, `SearchService.ingest`, `EmbeddingCacheService.embed`, the `documents` migration, `toVectorLiteral` — found via a mix of vector similarity, an exact `SearchService` symbol match, and one hop of graph expansion (pulling in the embeddings layer `search` calls, even though nothing in that layer shares the word "search"). Real answer, [Ollama](https://ollama.com) running `llama3` locally:

> Based on the provided code excerpts, here's how semantic search works in this project:
> 1. When a document is ingested into the system (excerpt [4]), its content and metadata are stored in the "documents" table along with its embedding vector (excerpt [5]).
> 2. The embedding vector is generated by the EmbeddingCacheService (excerpt [1]) which uses an external provider to embed the text into a numerical vector.
> 3. When searching for documents, the SearchService (excerpt [3]) uses the embedding vector to search for similar documents in the "documents" table, calculating cosine distance between the query and each document's embedding.
> 4. The SearchService returns the top N results (based on similarity) along with their distances from the original query.

Asking something with no answer in the code (*"what is the capital of France?"*) gets an honest decline instead of a hallucinated one — the prompt instructs the model to say so, and it does.

**Model quality is genuinely model-dependent, worth knowing before you judge the tool by it**: the default `llama3.2` (2GB, fast to pull) sometimes hedges — claiming a repo excerpt doesn't contain an answer that's plainly right there in it — even though retrieval handed it the exact right code every time in testing. Swapping to the larger `llama3` (4.7GB, same free Ollama setup, one config line: `OLLAMA_LLM_MODEL=llama3`) produced the well-structured, correctly-cited answer above from the *identical* retrieved context. Retrieval correctness and answer quality are separate concerns here — the first is what this project builds, the second is a knob you turn.

## Chunking

Indexing also chunks every method, function and interface — one chunk per symbol, its full source plus a `// file — QualifiedName` header, embedded via the same pluggable pipeline as `nestjs-ai-starter`. Classes aren't chunked as their own unit: a class's text already contains every one of its methods, which are separately chunked, so a whole-class chunk would duplicate that content and risk silent truncation by the embedding model's token limit.

This is what makes semantic search over code actually work, instead of the near-random matches a naive/stub embedding produces (see [`nestjs-ai-starter`](https://github.com/NivL1/nestjs-ai-starter)'s original hash-based stub, where "caching" scored a Postgres doc above the actual Redis-caching doc). Querying the real index here for *"how do I cache an embedding to avoid recomputing it"* correctly ranks:

```
EmbeddingCacheService.cacheKey   distance 0.39
EmbeddingCacheService.embed      distance 0.53
LocalEmbeddingsProvider.embed    distance 0.55
```

— found by meaning: `embed` and `LocalEmbeddingsProvider.embed` rank highly despite matching none of the query's actual words ("cache", "recomputing"), because their code *does* what the query describes.

## Testing

```bash
npm test
```

## License

MIT
