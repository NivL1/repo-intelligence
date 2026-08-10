import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCodeGraphTables1734000000000 implements MigrationInterface {
  name = 'CreateCodeGraphTables1734000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Read at execution time rather than module-load time, so this doesn't
    // depend on data-source.ts's dotenv config() call having already run.
    const dimensions = parseInt(process.env.EMBEDDING_DIMENSIONS ?? '384', 10);

    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "vector"`);

    await queryRunner.query(`
      CREATE TABLE "repositories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" varchar(255) NOT NULL,
        "source" text NOT NULL,
        "status" varchar(32) NOT NULL DEFAULT 'pending',
        "indexed_commit" varchar(64),
        "indexed_at" timestamptz,
        "error" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_repositories_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_repositories_name" UNIQUE ("name")
      )
    `);

    // One row per named thing the TypeScript compiler resolved: a class,
    // method, function, interface. `qualified_name` ("SearchService.search")
    // is what a user types on the CLI, so it's the lookup key — but it is
    // deliberately NOT unique: overloads and same-named symbols in different
    // files legitimately collide, and resolving that ambiguity is the
    // caller's job (it can ask the user which one they meant).
    await queryRunner.query(`
      CREATE TABLE "symbols" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "repository_id" uuid NOT NULL,
        "name" varchar(255) NOT NULL,
        "qualified_name" varchar(512) NOT NULL,
        "kind" varchar(32) NOT NULL,
        "file_path" text NOT NULL,
        "start_line" integer NOT NULL,
        "end_line" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_symbols_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_symbols_repository" FOREIGN KEY ("repository_id")
          REFERENCES "repositories"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_symbols_repo_qualified_name" ON "symbols" ("repository_id", "qualified_name")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_symbols_repo_file" ON "symbols" ("repository_id", "file_path")`,
    );

    // Directed edges between symbols: calls, implements, extends, injects.
    await queryRunner.query(`
      CREATE TABLE "edges" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "repository_id" uuid NOT NULL,
        "from_symbol_id" uuid NOT NULL,
        "to_symbol_id" uuid NOT NULL,
        "kind" varchar(32) NOT NULL,
        CONSTRAINT "PK_edges_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_edges_repository" FOREIGN KEY ("repository_id")
          REFERENCES "repositories"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_edges_from" FOREIGN KEY ("from_symbol_id")
          REFERENCES "symbols"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_edges_to" FOREIGN KEY ("to_symbol_id")
          REFERENCES "symbols"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_edges_triple" UNIQUE ("from_symbol_id", "to_symbol_id", "kind")
      )
    `);

    // Blast radius walks edges BACKWARDS — "who points at this symbol" — so
    // the to_symbol_id index is the hot path, not from_symbol_id. Both exist
    // because `map` and graph expansion traverse forwards.
    await queryRunner.query(
      `CREATE INDEX "IDX_edges_to_symbol" ON "edges" ("to_symbol_id", "kind")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_edges_from_symbol" ON "edges" ("from_symbol_id", "kind")`,
    );

    // One row per AST-aware chunk: a complete function/method/class, not an
    // arbitrary character slice. `symbol_id` is nullable because some chunks
    // (a module's import header, a config file) have no owning symbol.
    await queryRunner.query(`
      CREATE TABLE "chunks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "repository_id" uuid NOT NULL,
        "symbol_id" uuid,
        "content" text NOT NULL,
        "file_path" text NOT NULL,
        "start_line" integer NOT NULL,
        "end_line" integer NOT NULL,
        "embedding" vector(${dimensions}) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chunks_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_chunks_repository" FOREIGN KEY ("repository_id")
          REFERENCES "repositories"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_chunks_symbol" FOREIGN KEY ("symbol_id")
          REFERENCES "symbols"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_chunks_repository" ON "chunks" ("repository_id")`);

    // ivfflat partitions vectors into `lists` clusters and only probes the
    // nearest `ivfflat.probes` of them (1 by default). On an index built
    // before any data, `lists = 1` (exact brute-force scan) is the only safe
    // default — a larger value clusters degenerately and can probe an empty
    // cluster, silently returning zero rows for a query that should match.
    // Bump towards sqrt(row count) and REINDEX once a real corpus exists.
    await queryRunner.query(`
      CREATE INDEX "IDX_chunks_embedding_ivfflat" ON "chunks"
      USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 1)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "chunks"`);
    await queryRunner.query(`DROP TABLE "edges"`);
    await queryRunner.query(`DROP TABLE "symbols"`);
    await queryRunner.query(`DROP TABLE "repositories"`);
  }
}
