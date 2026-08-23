import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getOverview } from '../api/overview';
import { getRepository } from '../api/repositories';
import type { Repository } from '../api/types';
import { AskPanel } from './panels/AskPanel';
import { ImpactPanel } from './panels/ImpactPanel';
import { MapPanel } from './panels/MapPanel';

type Tab = 'map' | 'ask' | 'impact';
const TABS: { id: Tab; label: string }[] = [
  { id: 'map', label: 'Map' },
  { id: 'ask', label: 'Ask' },
  { id: 'impact', label: 'Impact' },
];

export function RepoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [repo, setRepo] = useState<Repository | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('map');
  const [overview, setOverview] = useState<string | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getRepository(id)
      .then(setRepo)
      .catch((err) => setError(err instanceof Error ? err.message : 'failed to load repository'));
    // Best-effort, separate from the repo fetch above — a slow or failed
    // overview shouldn't block the page or the tabs below it from working.
    getOverview(id)
      .then((result) => setOverview(result.overview))
      .catch(() => setOverview(null))
      .finally(() => setOverviewLoading(false));
  }, [id]);

  return (
    <div className="page page-wide">
      <header className="page-header">
        <Link to="/" className="link-button">
          ← All repositories
        </Link>
      </header>

      {error && <p className="error">{error}</p>}
      {repo && (
        <>
          <h1>{repo.name}</h1>
          <p className="subtitle">
            {repo.source} · indexed at {repo.indexedCommit?.slice(0, 7) ?? '—'}
          </p>

          {overviewLoading ? (
            <p className="repo-overview loading">Generating a summary…</p>
          ) : (
            overview && <p className="repo-overview">{overview}</p>
          )}

          <nav className="tab-bar">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={t.id === tab ? 'tab active' : 'tab'}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {tab === 'map' && <MapPanel repoId={repo.id} />}
          {tab === 'ask' && <AskPanel repo={repo} />}
          {tab === 'impact' && <ImpactPanel repoId={repo.id} />}
        </>
      )}
    </div>
  );
}
