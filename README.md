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
- [x] Schema for `repositories`, `symbols`, `edges`, `chunks`
- [x] Inherited foundation: JWT auth, Postgres, Redis, pluggable embeddings (local ONNX by default), Docker, CI, Swagger
- [ ] Symbol extraction via `ts-morph` (Day 2)
- [ ] `impact` — blast radius analysis (Day 3)
- [ ] AST-aware chunking and embedding (Day 4)
- [ ] `ask` — hybrid retrieval with `file:line` citations (Day 5)
- [ ] `map` — Mermaid architecture diagrams (Day 6)
- [ ] Retrieval eval harness (Day 6)

Nothing above the line is aspirational; nothing below it is implemented yet.

## Built on

The service foundation — auth, database, Redis, the pluggable embeddings pipeline, Docker and CI — comes from [nestjs-ai-starter](https://github.com/NivL1/nestjs-ai-starter), a production-grade NestJS starter with a built-in pgvector RAG module. This repo is what that starter exists to make possible.

## Stack

- **NestJS 10** + TypeScript
- **Postgres** + **pgvector** — both the relational graph tables and the vector index
- **Redis** — embedding cache
- **ts-morph** — the TypeScript compiler API, for symbol resolution
- **@xenova/transformers** — local ONNX embeddings, no API key required

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

## Testing

```bash
npm test
```

## License

MIT
