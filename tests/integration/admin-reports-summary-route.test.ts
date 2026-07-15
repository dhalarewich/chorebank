import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionCookieValue, SESSION_COOKIE_NAME } from "@/lib/auth/session";

vi.mock("@/lib/server/domain/admin-service", () => ({
  getAdminReportingSummary: vi.fn().mockResolvedValue({
    generatedAt: 1,
    totals: {
      claimedStars: 10,
      redemptionsRequested: 4,
      redemptionsFulfilled: 3,
      pendingRedemptions: 1,
      coinsSpent: 75,
      coinsEarnedFromStars: 100,
      coinsEarnedFromInterest: 5,
      netCoinDelta: 30,
    },
    children: [],
  }),
}));

import { GET } from "@/app/api/admin/reports/summary/route";
import { getAdminReportingSummary } from "@/lib/server/domain/admin-service";

describe("GET /api/admin/reports/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows parent sessions", async () => {
    const token = createSessionCookieValue({
      householdId: "chorebank-household",
      actor: "parent",
      userId: "u_1",
      ttlMs: 60_000,
    });

    const request = new Request("http://localhost:3000/api/admin/reports/summary", {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
    });

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(getAdminReportingSummary).toHaveBeenCalledWith("chorebank-household");
    expect(body.summary.totals.claimedStars).toBe(10);
  });

  it("rejects kid sessions", async () => {
    const token = createSessionCookieValue({
      householdId: "chorebank-household",
      actor: "kid",
      childId: "primary",
      ttlMs: 60_000,
    });

    const request = new Request("http://localhost:3000/api/admin/reports/summary", {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
    });

    const response = await GET(request);
    expect(response.status).toBe(403);
  });
});
