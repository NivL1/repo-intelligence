import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password);
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>repo-intelligence</h1>
        <p className="subtitle">Codebase intelligence for TypeScript repos</p>

        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          {error && <p className="error">{error}</p>}

          <button type="submit" disabled={submitting}>
            {submitting ? 'Working…' : mode === 'login' ? 'Log in' : 'Register'}
          </button>
        </form>

        <button
          type="button"
          className="link-button"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Log in'}
        </button>
      </div>
    </div>
  );
}
