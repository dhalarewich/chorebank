import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionCookieValue, SESSION_COOKIE_NAME } from "@/lib/auth/session";

vi.mock("@/lib/server/domain/board-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/domain/board-service")>()),
  changeParentPassword: vi.fn(),
}));

import { PATCH } from "@/app/api/auth/password/route";
import { changeParentPassword } from "@/lib/server/domain/board-service";

const cookie = `${SESSION_COOKIE_NAME}=${createSessionCookieValue({
  householdId: "chorebank-household",
  actor: "parent",
  userId: "u_parent",
})}`;

describe("PATCH /api/auth/password", () => {
  beforeEach(() => vi.resetAllMocks());

  it("changes the authenticated parent's password", async () => {
    const response = await PATCH(new Request("http://localhost:3000/api/auth/password", {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: "current-password", newPassword: "new-password-long" }),
    }));

    expect(response.status).toBe(200);
    expect(changeParentPassword).toHaveBeenCalledWith({
      householdSlug: "chorebank-household",
      userId: "u_parent",
      currentPassword: "current-password",
      newPassword: "new-password-long",
    });
  });

  it("rejects a short new password", async () => {
    const response = await PATCH(new Request("http://localhost:3000/api/auth/password", {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: "current-password", newPassword: "short" }),
    }));

    expect(response.status).toBe(400);
    expect(changeParentPassword).not.toHaveBeenCalled();
  });
});
