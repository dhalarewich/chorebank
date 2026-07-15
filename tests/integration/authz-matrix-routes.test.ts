import { describe, expect, it, vi } from "vitest";
import { createSessionCookieValue, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { GET as getBoard } from "@/app/api/board/route";
import { GET as getRewards } from "@/app/api/rewards/route";
import { POST as postAward } from "@/app/api/stars/award/route";
import { POST as postClaim } from "@/app/api/stars/claim/route";
import { POST as postRedemptionRequest } from "@/app/api/redemptions/request/route";
import { POST as postRedemptionFulfill } from "@/app/api/redemptions/fulfill/route";
import { PATCH as patchSettings } from "@/app/api/settings/route";
import { POST as postPaydayRun } from "@/app/api/payday/run/route";
import { POST as postPaydayNewWeek } from "@/app/api/payday/new-week/route";
import { PATCH as patchPaydayScreen } from "@/app/api/payday/screen/route";
import { POST as postAdminChild } from "@/app/api/admin/children/route";
import { PATCH as patchAdminChild, DELETE as deleteAdminChild } from "@/app/api/admin/children/[childId]/route";
import { GET as getAdminChores } from "@/app/api/admin/chores/route";
import { GET as getAdminBootstrap } from "@/app/api/admin/bootstrap/route";
import { PATCH as patchSharedAdminChore, POST as postSharedAdminChore } from "@/app/api/admin/chores/shared/route";
import { GET as getAdminRewards } from "@/app/api/admin/rewards/route";
import { PATCH as patchAdminChoreReorder } from "@/app/api/admin/chores/reorder/route";
import { PATCH as patchAdminRewardReorder } from "@/app/api/admin/rewards/reorder/route";
import { PATCH as patchAdminHouseholdSettings } from "@/app/api/admin/household-settings/route";
import { POST as postAdminHouseholdReset } from "@/app/api/admin/household/reset/route";
import { GET as getAdminAuditEvents } from "@/app/api/admin/audit-events/route";
import { GET as getAdminReportsSummary } from "@/app/api/admin/reports/summary/route";
import { PATCH as patchParentPassword } from "@/app/api/auth/password/route";

type Handler = (request: Request) => Promise<Response>;

vi.mock("@/lib/observability/errors", () => ({
  reportError: vi.fn(),
}));

function makeLiveSessionCookie(token: string) {
  return `${SESSION_COOKIE_NAME}=${token}`;
}

function makeParentToken() {
  return createSessionCookieValue({
    householdId: "chorebank-household",
    actor: "parent",
    userId: "u_parent",
    ttlMs: 60_000,
  });
}

function makeKidToken() {
  return createSessionCookieValue({
    householdId: "chorebank-household",
    actor: "kid",
    childId: "primary",
    ttlMs: 60_000,
  });
}

describe("API auth/role matrix", () => {
  const parentOnlyEndpoints: Array<{ name: string; method: string; url: string; invoke: Handler }> = [
    { name: "PATCH /api/auth/password", method: "PATCH", url: "http://localhost:3000/api/auth/password", invoke: patchParentPassword },
    { name: "POST /api/stars/award", method: "POST", url: "http://localhost:3000/api/stars/award", invoke: postAward },
    {
      name: "POST /api/redemptions/fulfill",
      method: "POST",
      url: "http://localhost:3000/api/redemptions/fulfill",
      invoke: postRedemptionFulfill,
    },
    { name: "PATCH /api/settings", method: "PATCH", url: "http://localhost:3000/api/settings", invoke: patchSettings },
    { name: "POST /api/payday/run", method: "POST", url: "http://localhost:3000/api/payday/run", invoke: postPaydayRun },
    {
      name: "POST /api/payday/new-week",
      method: "POST",
      url: "http://localhost:3000/api/payday/new-week",
      invoke: postPaydayNewWeek,
    },
    { name: "POST /api/admin/children", method: "POST", url: "http://localhost:3000/api/admin/children", invoke: postAdminChild },
    {
      name: "PATCH /api/admin/children/:childId",
      method: "PATCH",
      url: "http://localhost:3000/api/admin/children/primary",
      invoke: (request) => patchAdminChild(request, { params: Promise.resolve({ childId: "primary" }) }),
    },
    {
      name: "DELETE /api/admin/children/:childId",
      method: "DELETE",
      url: "http://localhost:3000/api/admin/children/primary",
      invoke: (request) => deleteAdminChild(request, { params: Promise.resolve({ childId: "primary" }) }),
    },
    { name: "GET /api/admin/chores", method: "GET", url: "http://localhost:3000/api/admin/chores", invoke: getAdminChores },
    { name: "GET /api/admin/bootstrap", method: "GET", url: "http://localhost:3000/api/admin/bootstrap", invoke: getAdminBootstrap },
    { name: "POST /api/admin/chores/shared", method: "POST", url: "http://localhost:3000/api/admin/chores/shared", invoke: postSharedAdminChore },
    { name: "PATCH /api/admin/chores/shared", method: "PATCH", url: "http://localhost:3000/api/admin/chores/shared", invoke: patchSharedAdminChore },
    { name: "GET /api/admin/rewards", method: "GET", url: "http://localhost:3000/api/admin/rewards", invoke: getAdminRewards },
    {
      name: "PATCH /api/admin/chores/reorder",
      method: "PATCH",
      url: "http://localhost:3000/api/admin/chores/reorder",
      invoke: patchAdminChoreReorder,
    },
    {
      name: "PATCH /api/admin/rewards/reorder",
      method: "PATCH",
      url: "http://localhost:3000/api/admin/rewards/reorder",
      invoke: patchAdminRewardReorder,
    },
    {
      name: "PATCH /api/admin/household-settings",
      method: "PATCH",
      url: "http://localhost:3000/api/admin/household-settings",
      invoke: patchAdminHouseholdSettings,
    },
    {
      name: "POST /api/admin/household/reset",
      method: "POST",
      url: "http://localhost:3000/api/admin/household/reset",
      invoke: postAdminHouseholdReset,
    },
    {
      name: "GET /api/admin/audit-events",
      method: "GET",
      url: "http://localhost:3000/api/admin/audit-events",
      invoke: getAdminAuditEvents,
    },
    {
      name: "GET /api/admin/reports/summary",
      method: "GET",
      url: "http://localhost:3000/api/admin/reports/summary",
      invoke: getAdminReportsSummary,
    },
  ];

  const kidOnlyEndpoints: Array<{ name: string; method: string; url: string; invoke: Handler }> = [
    { name: "POST /api/stars/claim", method: "POST", url: "http://localhost:3000/api/stars/claim", invoke: postClaim },
    {
      name: "POST /api/redemptions/request",
      method: "POST",
      url: "http://localhost:3000/api/redemptions/request",
      invoke: postRedemptionRequest,
    },
  ];

  const protectedEndpoints: Array<{ name: string; method: string; url: string; invoke: Handler }> = [
    { name: "GET /api/board", method: "GET", url: "http://localhost:3000/api/board", invoke: getBoard },
    { name: "GET /api/rewards", method: "GET", url: "http://localhost:3000/api/rewards", invoke: getRewards },
    {
      name: "PATCH /api/payday/screen",
      method: "PATCH",
      url: "http://localhost:3000/api/payday/screen",
      invoke: patchPaydayScreen,
    },
    ...parentOnlyEndpoints,
    ...kidOnlyEndpoints,
  ];

  for (const endpoint of protectedEndpoints) {
    it(`${endpoint.name} rejects unauthenticated live requests`, async () => {
      const request = new Request(endpoint.url, { method: endpoint.method });
      const response = await endpoint.invoke(request);
      expect(response.status).toBe(401);
    });
  }

  for (const endpoint of parentOnlyEndpoints) {
    it(`${endpoint.name} rejects kid actor`, async () => {
      const request = new Request(endpoint.url, {
        method: endpoint.method,
        headers: {
          cookie: makeLiveSessionCookie(makeKidToken()),
        },
      });
      const response = await endpoint.invoke(request);
      expect(response.status).toBe(403);
    });
  }

  for (const endpoint of kidOnlyEndpoints) {
    it(`${endpoint.name} rejects parent actor`, async () => {
      const request = new Request(endpoint.url, {
        method: endpoint.method,
        headers: {
          cookie: makeLiveSessionCookie(makeParentToken()),
        },
      });
      const response = await endpoint.invoke(request);
      expect(response.status).toBe(403);
    });
  }
});
