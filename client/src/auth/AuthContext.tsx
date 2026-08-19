import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import * as authApi from '../api/auth';
import { clearTokens, getAccessToken, setTokens } from '../api/client';

interface AuthContextValue {
  isAuthenticated: boolean;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getAccessToken()));

  const login = useCallback(async (email: string, password: string) => {
    setTokens(await authApi.login(email, password));
    setIsAuthenticated(true);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    setTokens(await authApi.register(email, password));
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    // Best-effort: the point is clearing the LOCAL session, which must
    // succeed even if the network call to invalidate it server-side
    // doesn't (token already expired, server unreachable, etc.).
    void authApi.logout().catch(() => {});
    clearTokens();
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
