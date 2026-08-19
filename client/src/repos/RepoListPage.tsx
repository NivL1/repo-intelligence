import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { addAndIndexRepository, deleteRepository } from '../api/repositories';
import { useAuth } from '../auth/AuthContext';
import { useDemoMode } from '../config/DemoModeContext';
import type { Repository, RepositoryStatus } from '../api/types';
import { useRepositories } from './useRepositories';

const STATUS_LABEL: Record<RepositoryStatus, string> = {
  pending: 'Pending',
  cloning: 'Cloning…',
  indexing: 'Indexing…',
  ready: 'Ready',
  failed: 'Failed',
};

export function RepoListPage() {
  const { repositories, loading, error, refresh } = useRepositories();
  const { logout } = useAuth();
  const { demoMode } = useDemoMode();
  const navigate = useNavigate();
  const [source, setSource] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    setAddError(null);
    setAdding(true);
    try {
      await addAndIndexRepository(source.trim());
      setSource('');
    } catch (err) {
      // Registration can fail AFTER the row already exists — the backend
      // creates it, then fails the clone and marks the row 'failed' with a
      // real reason (e.g. an actual git error), rather than rolling it
      // back. Refreshing here (not just on success) is what makes that
      // row — and its specific error, rendered per-row below — actually
      // visible, instead of just this generic top-of-page message.
      setAddError(err instanceof Error ? err.message : 'failed to add repository');
    } finally {
      await refresh();
      setAdding(false);
    }
  }

  async function handleDelete(repo: Repository) {
    if (!confirm(`Delete "${repo.name}"? This removes its symbols, edges, chunks and working copy.`)) {
      return;
    }
    await deleteRepository(repo.id);
    await refresh();
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>repo-intelligence</h1>
        {demoMode ? (
          <span className="demo-badge">Public demo — read-only</span>
        ) : (
          <button type="button" className="link-button" onClick={logout}>
            Log out
          </button>
        )}
      </header>

      <p className="intro">
        repo-intelligence analyzes TypeScript repositories two ways: a compiler-built
        symbol graph for exact, structural questions ("what calls this?"), and AST-aware
        embeddings for fuzzy, conceptual ones ("how does auth work?").{' '}
        {demoMode
          ? 'The repository below has already been indexed this way — open it to explore.'
          : 'Paste a GitHub URL below and it gets cloned, parsed by the TypeScript ' +
            'compiler, and embedded automatically before you can explore it.'}
      </p>

      {!demoMode && (
        <>
          <form className="add-repo-form" onSubmit={handleAdd}>
            <input
              type="url"
              required
              placeholder="https://github.com/owner/repo"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              disabled={adding}
            />
            <button type="submit" disabled={adding}>
              {adding ? 'Adding…' : 'Add & Index'}
            </button>
          </form>
          {addError && <p className="error">{addError}</p>}
        </>
      )}

      {loading && <p>Loading…</p>}
      {error && <p className="error">{error}</p>}

      {!loading && repositories.length === 0 && (
        <p className="empty-state">
          {demoMode
            ? 'No repositories indexed yet.'
            : 'No repositories yet — paste an https:// GitHub URL above to get started.'}
        </p>
      )}

      <ul className="repo-list">
        {repositories.map((repo) => (
          <li key={repo.id} className="repo-row">
            <div className="repo-info">
              <span className="repo-name">{repo.name}</span>
              <span className={`status-badge status-${repo.status}`}>
                {STATUS_LABEL[repo.status]}
              </span>
              {repo.status === 'failed' && repo.error && (
                <span className="repo-error" title={repo.error}>
                  {repo.error}
                </span>
              )}
            </div>
            <div className="repo-actions">
              <button
                type="button"
                disabled={repo.status !== 'ready'}
                onClick={() => navigate(`/repos/${repo.id}`)}
              >
                Open
              </button>
              {!demoMode && (
                <button type="button" className="danger" onClick={() => handleDelete(repo)}>
                  Delete
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
