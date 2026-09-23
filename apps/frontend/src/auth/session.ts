// Shared session state used by both AuthContext and the API client, so the
// client can attach the bearer token and report 401s without importing React.

export const TOKEN_STORAGE_KEY = "equipment-hub.token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // Storage unavailable (e.g. private mode); the session lasts until refresh.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

/** Registers the callback run when an authenticated request returns 401. Returns an unregister function. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler): () => void {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) {
      unauthorizedHandler = null;
    }
  };
}

export function notifyUnauthorized(): void {
  clearToken();
  unauthorizedHandler?.();
}
