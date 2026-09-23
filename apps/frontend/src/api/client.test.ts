import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientApiError, listAssets, login } from "./client";
import { setUnauthorizedHandler, TOKEN_STORAGE_KEY } from "../auth/session";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("api client auth handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("attaches the stored bearer token to requests", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "jwt-abc");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, []));
    vi.stubGlobal("fetch", fetchMock);

    await listAssets();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer jwt-abc");
  });

  it("omits the Authorization header when there is no token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, []));
    vi.stubGlobal("fetch", fetchMock);

    await listAssets();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("clears the token and notifies the handler on a 401", async () => {
    localStorage.setItem(TOKEN_STORAGE_KEY, "expired");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { message: "Unauthorized" })));
    const handler = vi.fn();
    const unregister = setUnauthorizedHandler(handler);

    await expect(listAssets()).rejects.toBeInstanceOf(ClientApiError);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    unregister();
  });

  it("does not end the session when login itself returns 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { message: "Invalid email or password" })));
    const handler = vi.fn();
    const unregister = setUnauthorizedHandler(handler);

    await expect(login({ email: "a@b.test", password: "wrong" })).rejects.toThrow("Invalid email or password");

    expect(handler).not.toHaveBeenCalled();
    unregister();
  });
});
