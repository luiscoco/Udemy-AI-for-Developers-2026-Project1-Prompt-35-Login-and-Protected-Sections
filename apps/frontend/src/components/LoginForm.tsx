import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";

function LoginForm() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Login failed");
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <form className="panel login-form" onSubmit={handleSubmit} aria-label="Log in">
        <h1>Equipment Maintenance Hub</h1>
        <p className="panel-note">Sign in to continue.</p>

        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}

        <div className="form-field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={submitting}
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={submitting}
            required
          />
        </div>

        <button className="btn btn--primary" type="submit" disabled={submitting}>
          {submitting ? "Logging in..." : "Log in"}
        </button>
      </form>
    </div>
  );
}

export default LoginForm;
