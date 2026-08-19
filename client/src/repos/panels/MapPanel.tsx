import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { getMap } from '../../api/map';
import type { MapResult } from '../../api/types';
import { MermaidDiagram } from './MermaidDiagram';

export function MapPanel({ repoId }: { repoId: string }) {
  const [result, setResult] = useState<MapResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [moduleInput, setModuleInput] = useState('');

  const load = useCallback(
    async (module?: string) => {
      setLoading(true);
      setError(null);
      try {
        setResult(await getMap(repoId, module));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'failed to load the diagram');
      } finally {
        setLoading(false);
      }
    },
    [repoId],
  );

  // Module-level overview loads on its own — no click needed to see
  // something. Zooming into a module is the only thing that needs input.
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoId]);

  function handleZoom(event: FormEvent) {
    event.preventDefault();
    if (moduleInput.trim()) void load(moduleInput.trim());
  }

  return (
    <div className="panel">
      <p className="panel-description">
        Architecture diagram rendered straight from the symbol graph — module-level
        coupling by default, or zoom into one module to see its actual classes, methods
        and interfaces. No LLM: the same indexed commit always renders the exact same
        diagram, byte for byte.
      </p>

      <div className="map-toolbar">
        <form onSubmit={handleZoom} className="zoom-form">
          <input
            type="text"
            placeholder="module name, e.g. search"
            value={moduleInput}
            onChange={(e) => setModuleInput(e.target.value)}
          />
          <button type="submit" disabled={loading || !moduleInput.trim()}>
            Zoom in
          </button>
        </form>
        {result?.scope === 'symbol' && (
          <button type="button" onClick={() => void load()}>
            ← Back to overview
          </button>
        )}
        <button type="button" onClick={() => void load(result?.module ?? undefined)}>
          Refresh
        </button>
      </div>

      {loading && <p>Loading…</p>}
      {error && <p className="error">{error}</p>}

      {result && !loading && (
        <>
          <p className="subtitle">
            {result.scope === 'module' ? 'Module-level coupling' : `Zoomed into "${result.module}"`}{' '}
            · {result.nodeCount} nodes, {result.edgeCount} edges
          </p>
          <MermaidDiagram code={result.mermaid} />
        </>
      )}
    </div>
  );
}
