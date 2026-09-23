import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "@equipment-hub/contract";
import { getCurrentUser, login as loginRequest } from "../api/client";
import { clearToken, getToken, setToken, setUnauthorizedHandler } from "./session";

interface AuthState {
  user: User | null;
  token: string | null;
}

export interface AuthContextValue extends AuthState {
  /** True while a stored token is being checked against GET /api/auth/me. */
  initializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => ({ user: null, token: getToken() }));
  const [initializing, setInitializing] = useState(() => getToken() !== null);

  const logout = useCallback(() => {
    clearToken();
    setState({ user: null, token: null });
  }, []);

  // Any 401 from the API client ends the session and returns to the login form.
  useEffect(() => setUnauthorizedHandler(logout), [logout]);

  // Hydrate the user from a token persisted by a previous page load.
  useEffect(() => {
    const storedToken = getToken();
    if (!storedToken) {
      return;
    }

    let cancelled = false;

    getCurrentUser()
      .then((user) => {
        if (!cancelled) {
          setState({ user, token: storedToken });
        }
      })
      .catch(() => {
        if (!cancelled) {
          logout();
        }
      })
      .finally(() => {
        if (!cancelled) {
          setInitializing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await loginRequest({ email, password });
    setToken(response.token);
    setState({ user: response.user, token: response.token });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, initializing, login, logout }),
    [state, initializing, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
