import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionCookieValue, SESSION_COOKIE_NAME } from "@/lib/auth/session";

vi.mock("@/lib/server/domain/board-service", () => {
  class DomainError extends Error {
    code: string;
    status: number;

    constructor(message: string, code = "DOMAIN_ERROR", status = 400) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }

  return {
    DomainError,
    claimStar: vi.fn().mockResolvedValue({
      householdId: "chorebank-household",
      currentDay: 4,
      paydayDay: 6,
      interestRate: 5,
      kidsScreen: "active",
      settings: { sounds: true, animations: true },
      children: [],
      redemptions: [],
      paydaySummary: {},
    }),
  };
});

import { POST } from "@/app/api/stars/claim/route";
import { claimStar } from "@/lib/server/domain/board-service";

describe("POST /api/stars/claim role checks", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects parent actor", async () => {
    const token = createSessionCookieValue({
      householdId: "chorebank-household",
      actor: "parent",
      userId: "u_1",
      ttlMs: 60_000,
    });

    const request = new Request("http://localhost:3000/api/stars/claim", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: JSON.stringify({
        childId: "primary",
        rowId: "make-bed",
        day: 4,
        isBonus: false,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it("rejects kid claiming for another child", async () => {
    const token = createSessionCookieValue({
      householdId: "chorebank-household",
      actor: "kid",
      childId: "primary",
      ttlMs: 60_000,
    });

    const request = new Request("http://localhost:3000/api/stars/claim", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: JSON.stringify({
        childId: "secondary",
        rowId: "make-bed",
        day: 4,
        isBonus: false,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it("allows kid claiming own star", async () => {
    const token = createSessionCookieValue({
      householdId: "chorebank-household",
      actor: "kid",
      childId: "primary",
      ttlMs: 60_000,
    });

    const request = new Request("http://localhost:3000/api/stars/claim", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: JSON.stringify({
        childId: "primary",
        rowId: "make-bed",
        day: 4,
        isBonus: false,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(claimStar).toHaveBeenCalledTimes(1);
  });
});
