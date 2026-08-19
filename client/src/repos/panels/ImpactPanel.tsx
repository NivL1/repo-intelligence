import { useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { getImpact } from '../../api/impact';
import type { AmbiguousSymbolBody, ImpactResult } from '../../api/types';

const DEFAULT_DEPTH = 3;

export function ImpactPanel({ repoId }: { repoId: string }) {
  const [symbol, setSymbol] = useState('');
  const [depth, setDepth] = useState(DEFAULT_DEPTH);
  const [result, setResult] = useState<ImpactResult | null>(null);
  const [candidates, setCandidates] = useState<AmbiguousSymbolBody['candidates']>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runAnalysis(query: { symbol?: string; symbolId?: string }) {
    setLoading(true);
    setError(null);
    setCandidates([]);
    try {
      setResult(await getImpact(repoId, { ...query, depth }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Ambiguous name — the backend hands back every match rather than
        // guessing; let the user pick which one they meant.
        setCandidates((err.body as AmbiguousSymbolBody).candidates);
        setResult(null);
      } else {
        setError(err instanceof Error ? err.message : 'failed to analyze impact');
        setResult(null);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (symbol.trim()) void runAnalysis({ symbol: symbol.trim() });
  }

  return (
    <div className="panel">
      <form className="panel-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="SearchService.search"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
        />
        <input
          type="number"
          min={1}
          max={10}
          value={depth}
          onChange={(e) => setDepth(Number(e.target.value) || DEFAULT_DEPTH)}
          title="How many hops of callers to walk"
        />
        <button type="submit" disabled={loading || !symbol.trim()}>
          {loading ? 'Analyzing…' : 'Analyze'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {candidates.length > 0 && (
        <div className="candidates">
          <p>
            "{symbol}" matches {candidates.length} symbols — pick one:
          </p>
          <ul>
            {candidates.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => void runAnalysis({ symbolId: c.id })}>
                  {c.qualifiedName}
                </button>
                <span className="candidate-detail">
                  {c.kind} · {c.filePath}:{c.startLine}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && (
        <div className="impact-result">
          <h3>{result.symbol.qualifiedName}</h3>
          <p className="subtitle">
            {result.symbol.filePath}:{result.symbol.startLine}
          </p>

          {result.affectedModules.length > 0 && (
            <div className="chip-row">
              {result.affectedModules.map((m) => (
                <span className="chip" key={m}>
                  {m}
                </span>
              ))}
            </div>
          )}

          {result.callers.length === 0 ? (
            <p className="empty-state">Nothing calls this — safe to change in isolation.</p>
          ) : (
            <table className="callers-table">
              <thead>
                <tr>
                  <th>Depth</th>
                  <th>Caller</th>
                  <th>File</th>
                </tr>
              </thead>
              <tbody>
                {result.callers.map((c) => (
                  <tr key={c.symbol.id}>
                    <td>{c.depth}</td>
                    <td>{c.symbol.qualifiedName}</td>
                    <td className="mono">
                      {c.symbol.filePath}:{c.symbol.startLine}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h4>Related tests</h4>
          {result.relatedTests.length === 0 ? (
            <p className="empty-state">None found by filename convention.</p>
          ) : (
            <ul className="test-list">
              {result.relatedTests.map((t) => (
                <li key={t} className="mono">
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
