import { useEffect, useState } from 'react';
import { getMap } from '../api/map';
import { getOverview } from '../api/overview';
import { MermaidDiagram } from './panels/MermaidDiagram';

const FEATURES = [
  {
    tag: 'No LLM',
    title: 'Impact',
    description:
      'Reverse-walk the compiler-built call graph to see everything that calls a function, ' +
      'directly and transitively, plus which modules and tests it touches.',
  },
  {
    tag: 'No LLM',
    title: 'Map',
    description:
      'Architecture diagrams rendered straight from the symbol graph — module coupling, ' +
      'or one module\'s real classes and methods. The same commit always renders the same diagram.',
  },
  {
    tag: 'LLM-backed',
    title: 'Ask',
    description:
      'Ask a question in plain English. Hybrid retrieval finds the relevant code, an LLM ' +
      'answers using only that — citing exactly which excerpt backs each claim.',
  },
];

/** A real answer captured from this exact demo, not regenerated on every
 *  page load — `ask` calls a real LLM and costs real money per call, so
 *  this showcase can't be live-fetched the way the diagram below is. */
const ASK_EXAMPLE = {
  question: 'How does semantic search work in this project?',
  answer:
    'When a search query is received, it’s converted into a vector using ' +
    'EmbeddingCacheService.embed [3]. That embedding queries Postgres, comparing it ' +
    'against every stored document’s embedding with a vector similarity operator [1]. ' +
    'Results are ordered by that distance and limited to the requested count [1], returned ' +
    'with the computed distance for each match [7].',
  sources: ['SearchService.search', 'EmbeddingCacheService.embed', 'SearchResult'],
};

export function DemoLanding({ repoId }: { repoId: string }) {
  const [diagram, setDiagram] = useState<string | null>(null);
  const [overview, setOverview] = useState<string | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  useEffect(() => {
    getMap(repoId)
      .then((result) => setDiagram(result.mermaid))
      .catch(() => setDiagram(null));
    getOverview(repoId)
      .then((result) => setOverview(result.overview))
      .catch(() => setOverview(null))
      .finally(() => setOverviewLoading(false));
  }, [repoId]);

  return (
    <section className="demo-landing">
      <div className="hero">
        <h1>repo-intelligence</h1>
        <p className="hero-tagline">Codebase intelligence for TypeScript repositories.</p>
        <p className="hero-description">
          It builds two indexes of a repo — a <strong>compiler-built symbol graph</strong> for
          exact, structural questions, and <strong>AST-aware embeddings</strong> for fuzzy,
          conceptual ones — then uses them to summarize what a repo does, render its
          architecture as a live diagram, trace blast radius, and answer questions with
          cited sources.
        </p>
      </div>

      {(overview || overviewLoading) && (
        <div className="showcase">
          <p className="showcase-label">Live example — what this repository actually is</p>
          {overviewLoading ? (
            <p className="empty-state">Generating…</p>
          ) : (
            <p className="overview-text">{overview}</p>
          )}
        </div>
      )}

      {diagram && (
        <div className="showcase">
          <p className="showcase-label">Live example — this repository's real architecture</p>
          <MermaidDiagram code={diagram} />
        </div>
      )}

      <div className="feature-grid">
        {FEATURES.map((f) => (
          <div className="feature-card" key={f.title}>
            <span className={f.tag === 'No LLM' ? 'feature-tag' : 'feature-tag llm'}>
              {f.tag}
            </span>
            <h3>{f.title}</h3>
            <p>{f.description}</p>
          </div>
        ))}
      </div>

      <div className="showcase">
        <p className="showcase-label">Real example — an actual answer from this demo</p>
        <div className="ask-showcase">
          <p className="ask-showcase-question">"{ASK_EXAMPLE.question}"</p>
          <p className="ask-showcase-answer">{ASK_EXAMPLE.answer}</p>
          <div className="chip-row">
            {ASK_EXAMPLE.sources.map((s) => (
              <span className="chip" key={s}>
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="scroll-hint">Explore it yourself below ↓</p>
    </section>
  );
}
