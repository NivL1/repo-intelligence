import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getRepository } from '../api/repositories';
import type { Repository } from '../api/types';

/**
 * Placeholder for the Impact / Map / Ask panels — deliberately just a
 * fetch-and-render shell for now, so the route, the auth guard and the
 * "Open" navigation from the list page all have something real to land
 * on and can be verified end-to-end before the panels themselves exist.
 */
export function RepoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [repo, setRepo] = useState<Repository | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getRepository(id)
      .then(setRepo)
      .catch((err) => setError(err instanceof Error ? err.message : 'failed to load repository'));
  }, [id]);

  return (
    <div className="page">
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
          <p className="empty-state">Impact / Map / Ask panels land here next.</p>
        </>
      )}
    </div>
  );
}
