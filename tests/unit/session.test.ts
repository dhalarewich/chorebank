import { describe, expect, it } from "vitest";
import {
  createSessionCookieValue,
  getDefaultHouseholdId,
  getSessionContext,
  sanitizeHouseholdId,
  verifySessionToken,
} from "@/lib/auth/session";

describe("session utilities", () => {
  it("sanitizes household id", () => {
    expect(sanitizeHouseholdId(" My House! ")).toBe("my-house-");
    expect(sanitizeHouseholdId("")).toBe("");
  });

  it("provides a default household id", () => {
    expect(getDefaultHouseholdId()).toBe("chorebank-household");
  });

  it("creates and verifies signed session token", () => {
    const token = createSessionCookieValue({
      householdId: "alpha-home",
      actor: "parent",
      userId: "u1",
      ttlMs: 60_000,
    });

    const payload = verifySessionToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.householdId).toBe("alpha-home");
    expect(payload?.actor).toBe("parent");
    expect(payload?.userId).toBe("u1");
  });

  it("does not auto-authenticate without a session cookie", () => {
    const request = new Request("http://localhost:3000/api/board");
    const session = getSessionContext(request);
    expect(session.isAuthenticated).toBe(false);
    expect(session.mode).toBe("live");
  });
});
