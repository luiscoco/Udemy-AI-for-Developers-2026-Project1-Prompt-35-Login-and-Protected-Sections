import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User } from "@equipment-hub/contract";
import { AuthProvider, useAuth } from "./AuthContext";
import { notifyUnauthorized, TOKEN_STORAGE_KEY } from "./session";
import * as apiClient from "../api/client";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return {
    ...actual,
    login: vi.fn(),
    getCurrentUser: vi.fn(),
  };
});

const user: User = {
  id: "user-1",
  email: "sam@equipment-hub.test",
  name: "Sam Supervisor",
  role: "supervisor",
  technicianId: null,
};

function AuthProbe() {
  const { user: currentUser, token, initializing, login, logout } = useAuth();
  return (
    <div>
      <p data-testid="status">{initializing ? "initializing" : currentUser ? currentUser.name : "anonymous"}</p>
      <p data-testid="token">{token ?? "none"}</p>
      <button type="button" onClick={() => void login("sam@equipment-hub.test", "Super!2345").catch(() => {})}>
        login
      </button>
      <button type="button" onClick={logout}>
        logout
      </button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <AuthProvider>
      <AuthProbe />
    </AuthProvider>,
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    vi.mocked(apiClient.login).mockReset();
    vi.mocked(apiClient.getCurrentUser).mockReset();
  });

  it("logs in, persists the token, and logs out clearing it", async () => {
    const userEv = userEvent.setup();
    vi.mocked(apiClient.login).mockResolvedValue({ token: "jwt-123", user });

    renderWithProvider();
    expect(screen.getByTestId("status")).toHaveTextContent("anonymous");
    expect(apiClient.getCurrentUser).not.toHaveBeenCalled();

    await userEv.click(screen.getByRole("button", { name: "login" }));

    expect(apiClient.login).toHaveBeenCalledWith({ email: "sam@equipment-hub.test", password: "Super!2345" });
    expect(await screen.findByText("Sam Supervisor")).toBeInTheDocument();
    expect(screen.getByTestId("token")).toHaveTextContent("jwt-123");
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBe("jwt-123");

    await userEv.click(screen.getByRole("button", { name: "logout" }));

    expect(screen.getByTestId("status")).toHaveTextContent("anonymous");
    expect(screen.getByTestId("token")).toHaveTextContent("none");
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it("stays logged out and stores nothing when login fails", async () => {
    const userEv = userEvent.setup();
    vi.mocked(apiClient.login).mockRejectedValue(new apiClient.ClientApiError(401, "Invalid email or password"));

    renderWithProvider();
    await userEv.click(screen.getByRole("button", { name: "login" }));

    await waitFor(() => expect(apiClient.login).toHaveBeenCalled());
    expect(screen.getByTestId("status")).toHaveTextContent("anonymous");
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it("hydrates the user from a stored token via GET /api/auth/me", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "stored-token");
    vi.mocked(apiClient.getCurrentUser).mockResolvedValue(user);

    renderWithProvider();
    expect(screen.getByTestId("status")).toHaveTextContent("initializing");

    expect(await screen.findByText("Sam Supervisor")).toBeInTheDocument();
    expect(screen.getByTestId("token")).toHaveTextContent("stored-token");
  });

  it("logs out when hydrating the stored token fails", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "expired-token");
    vi.mocked(apiClient.getCurrentUser).mockRejectedValue(new apiClient.ClientApiError(401, "Unauthorized"));

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(screen.getByTestId("token")).toHaveTextContent("none");
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });

  it("logs out when the API client reports a 401", async () => {
    const userEv = userEvent.setup();
    vi.mocked(apiClient.login).mockResolvedValue({ token: "jwt-123", user });

    renderWithProvider();
    await userEv.click(screen.getByRole("button", { name: "login" }));
    expect(await screen.findByText("Sam Supervisor")).toBeInTheDocument();

    act(() => notifyUnauthorized());

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });
});
