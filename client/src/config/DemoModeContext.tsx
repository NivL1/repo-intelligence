import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getPublicConfig } from '../api/config';

interface DemoModeContextValue {
  /** True until the one /config fetch this app ever makes has resolved. */
  loading: boolean;
  demoMode: boolean;
}

const DemoModeContext = createContext<DemoModeContextValue>({ loading: true, demoMode: false });

/**
 * Fetches /config once at startup so the rest of the app can decide
 * whether to show a login wall at all. Deliberately NOT a security
 * boundary — every route this affects is independently enforced
 * server-side (DemoWriteGuard blocks writes, @PublicInDemoMode allows
 * reads) regardless of what this reports; a stale or spoofed value here
 * only changes what the UI shows, never what the API actually allows.
 */
export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoModeContextValue>({ loading: true, demoMode: false });

  useEffect(() => {
    getPublicConfig()
      .then((config) => setState({ loading: false, demoMode: config.demoMode }))
      // If /config itself is unreachable, something's badly wrong with
      // the deployment — fail toward requiring login (demoMode: false)
      // rather than accidentally exposing a login-free UI on an error.
      .catch(() => setState({ loading: false, demoMode: false }));
  }, []);

  return <DemoModeContext.Provider value={state}>{children}</DemoModeContext.Provider>;
}

export function useDemoMode(): DemoModeContextValue {
  return useContext(DemoModeContext);
}
