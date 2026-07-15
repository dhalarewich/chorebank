import { describe, expect, it } from "vitest";
import { createSessionCookieValue, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { requireSession } from "@/lib/server/auth/guards";
import { DomainError } from "@/lib/server/domain/board-service";

const cookie = `${SESSION_COOKIE_NAME}=${createSessionCookieValue({
  householdId: "chorebank-household",
  actor: "parent",
  userId: "u_parent",
})}`;

describe("same-origin protection", () => {
  it("rejects cross-origin authenticated mutations", () => {
    const request = new Request("https://chorebank.example/api/settings", {
      method: "PATCH",
      headers: { cookie, origin: "https://attacker.example" },
    });

    expect(() => requireSession(request)).toThrowError(expect.objectContaining<Partial<DomainError>>({ code: "CROSS_ORIGIN" }));
  });

  it("allows same-origin browser and headerless non-browser mutations", () => {
    expect(requireSession(new Request("https://chorebank.example/api/settings", {
      method: "PATCH",
      headers: { cookie, origin: "https://chorebank.example" },
    })).userId).toBe("u_parent");

    expect(requireSession(new Request("https://chorebank.example/api/settings", {
      method: "PATCH",
      headers: { cookie },
    })).userId).toBe("u_parent");
  });
});
