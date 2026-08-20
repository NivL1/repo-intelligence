import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useDemoMode } from '../config/DemoModeContext';
import { useAuth } from './AuthContext';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { loading, demoMode } = useDemoMode();

  // Wait for the one /config fetch to resolve before deciding anything —
  // redirecting to /login and then immediately back (once demoMode turns
  // out true) would be a visible flash, not just a wasted render.
  if (loading) return null;

  if (!demoMode && !isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
