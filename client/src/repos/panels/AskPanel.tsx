import { useState, type FormEvent } from 'react';
import { ask } from '../../api/ask';
import type { AskResult, Repository } from '../../api/types';
import { githubFileUrl } from './github-link';

export function AskPanel({ repo }: { repo: Repository }) {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await ask(repo.id, question.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to get an answer');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel">
      <p className="panel-description">
        Ask a question in plain English. Hybrid retrieval — vector similarity, exact
        symbol-name matches, and one hop of the call graph — finds the most relevant code,
        then an LLM answers using only those excerpts, citing exactly which one backs each
        claim. If the code doesn't actually answer the question, it says so instead of
        guessing.
      </p>

      <form className="ask-form" onSubmit={handleSubmit}>
        <textarea
          rows={3}
          placeholder="How does semantic search work in this project?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" disabled={loading || !question.trim()}>
          {loading ? 'Thinking…' : 'Ask'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {result && (
        <div className="ask-result">
          <p className="ask-answer">{result.answer}</p>

          {result.sources.length > 0 && (
            <>
              <h4>Sources</h4>
              <ul className="source-list">
                {result.sources.map((source) => {
                  const url = githubFileUrl(
                    repo.source,
                    repo.indexedCommit,
                    source.filePath,
                    source.startLine,
                    source.endLine,
                  );
                  const label = `[${source.n}] ${source.filePath}:${source.startLine}-${source.endLine}${
                    source.qualifiedName ? ` (${source.qualifiedName})` : ''
                  }`;
                  return (
                    <li key={source.n} className="mono">
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer">
                          {label}
                        </a>
                      ) : (
                        label
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
