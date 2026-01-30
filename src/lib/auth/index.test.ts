import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("react", () => ({
  cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("./lucia", () => ({
  lucia: {
    sessionCookieName: "auth_session",
    validateSession: vi.fn(),
    createSessionCookie: vi.fn(),
    createBlankSessionCookie: vi.fn(),
  },
}));

import { validateRequest } from "./index";
import { lucia } from "./lucia";
import { cookies } from "next/headers";

type CookieStore = Awaited<ReturnType<typeof cookies>>;
type ValidateSessionResult = Awaited<ReturnType<typeof lucia.validateSession>>;
type LuciaCookie = ReturnType<typeof lucia.createSessionCookie>;

describe("validateRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return null user and session when no cookie exists", async () => {
    const mockCookieStore = { get: vi.fn().mockReturnValue(undefined), set: vi.fn() };
    vi.mocked(cookies).mockResolvedValue(mockCookieStore as unknown as CookieStore);

    const result = await validateRequest();

    expect(result).toEqual({ user: null, session: null });
    expect(lucia.validateSession).not.toHaveBeenCalled();
  });

  it("should validate and return user/session for a valid session cookie", async () => {
    const mockSession = { id: "session-123", fresh: false, userId: "user-1", expiresAt: new Date() };
    const mockUser = { id: "user-1", email: "test@example.com" };
    const mockCookieStore = { get: vi.fn().mockReturnValue({ value: "session-123" }), set: vi.fn() };

    vi.mocked(cookies).mockResolvedValue(mockCookieStore as unknown as CookieStore);
    vi.mocked(lucia.validateSession).mockResolvedValue({ session: mockSession, user: mockUser } as unknown as ValidateSessionResult);

    const result = await validateRequest();

    expect(result).toEqual({ session: mockSession, user: mockUser });
    expect(lucia.validateSession).toHaveBeenCalledWith("session-123");
  });

  it("should refresh the cookie when the session is fresh", async () => {
    const mockSession = { id: "session-123", fresh: true, userId: "user-1", expiresAt: new Date() };
    const mockUser = { id: "user-1", email: "test@example.com" };
    const mockSessionCookie = { name: "auth_session", value: "refreshed-value", attributes: { secure: false } };
    const mockCookieStore = { get: vi.fn().mockReturnValue({ value: "session-123" }), set: vi.fn() };

    vi.mocked(cookies).mockResolvedValue(mockCookieStore as unknown as CookieStore);
    vi.mocked(lucia.validateSession).mockResolvedValue({ session: mockSession, user: mockUser } as unknown as ValidateSessionResult);
    vi.mocked(lucia.createSessionCookie).mockReturnValue(mockSessionCookie as unknown as LuciaCookie);

    await validateRequest();

    expect(lucia.createSessionCookie).toHaveBeenCalledWith("session-123");
    expect(mockCookieStore.set).toHaveBeenCalledWith("auth_session", "refreshed-value", { secure: false });
  });

  it("should clear the cookie when the session is invalid", async () => {
    const mockBlankCookie = { name: "auth_session", value: "", attributes: { secure: false } };
    const mockCookieStore = { get: vi.fn().mockReturnValue({ value: "expired-session" }), set: vi.fn() };

    vi.mocked(cookies).mockResolvedValue(mockCookieStore as unknown as CookieStore);
    vi.mocked(lucia.validateSession).mockResolvedValue({ session: null, user: null });
    vi.mocked(lucia.createBlankSessionCookie).mockReturnValue(mockBlankCookie as unknown as LuciaCookie);

    const result = await validateRequest();

    expect(result).toEqual({ session: null, user: null });
    expect(lucia.createBlankSessionCookie).toHaveBeenCalled();
    expect(mockCookieStore.set).toHaveBeenCalledWith("auth_session", "", { secure: false });
  });

  it("should swallow errors when setting cookies in server components", async () => {
    const mockSession = { id: "session-123", fresh: true, userId: "user-1", expiresAt: new Date() };
    const mockUser = { id: "user-1", email: "test@example.com" };
    const mockSessionCookie = { name: "auth_session", value: "new-value", attributes: {} };
    const mockCookieStore = {
      get: vi.fn().mockReturnValue({ value: "session-123" }),
      set: vi.fn().mockImplementation(() => { throw new Error("Cannot set cookies in server components"); }),
    };

    vi.mocked(cookies).mockResolvedValue(mockCookieStore as unknown as CookieStore);
    vi.mocked(lucia.validateSession).mockResolvedValue({ session: mockSession, user: mockUser } as unknown as ValidateSessionResult);
    vi.mocked(lucia.createSessionCookie).mockReturnValue(mockSessionCookie as unknown as LuciaCookie);

    // Should not throw — the catch block handles this
    const result = await validateRequest();
    expect(result).toEqual({ session: mockSession, user: mockUser });
  });
});
