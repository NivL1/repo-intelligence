import { useCallback, useEffect, useRef, useState } from 'react';
import { listRepositories } from '../api/repositories';
import { isInProgress, type Repository } from '../api/types';

const POLL_INTERVAL_MS = 2000;

/**
 * Loads the repository list and keeps polling it while ANY row is still
 * pending/cloning/indexing.
 *
 * `refresh` schedules its own follow-up tick rather than the mount effect
 * owning a separate poll loop — that's deliberate, not an equivalent
 * simplification. A loop that only decided whether to continue from
 * *its own* previous tick would go permanently idle the moment nothing
 * was in progress, and then never notice a new in-progress row created by
 * an action elsewhere (e.g. RepoListPage's "Add & Index" calling
 * `refresh()` after the add finishes). Since every caller of `refresh` —
 * including that one — goes through the same self-scheduling function,
 * any of them can revive polling, not just the mount-time loop.
 */
export function useRepositories() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    clearTimeout(timerRef.current);
    try {
      const result = await listRepositories();
      if (!mountedRef.current) return result;
      setRepositories(result);
      setError(null);
      if (result.some((r) => isInProgress(r.status))) {
        timerRef.current = setTimeout(refresh, POLL_INTERVAL_MS);
      }
      return result;
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'failed to load repositories');
      }
      return [];
    } finally {
      if (mountedRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      mountedRef.current = false;
      clearTimeout(timerRef.current);
    };
  }, [refresh]);

  return { repositories, loading, error, refresh };
}
