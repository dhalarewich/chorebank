import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionCookieValue, SESSION_COOKIE_NAME } from "@/lib/auth/session";

vi.mock("@/lib/observability/errors", () => ({
  reportError: vi.fn(),
}));

vi.mock("@/lib/server/domain/board-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/domain/board-service")>();
  return {
    ...actual,
    runPayday: vi.fn().mockResolvedValue({ ok: true }),
    startNewWeek: vi.fn().mockResolvedValue({ ok: true }),
    setKidsScreenState: vi.fn().mockResolvedValue({ ok: true }),
  };
});

import { POST as postRunPayday } from "@/app/api/payday/run/route";
import { POST as postNewWeek } from "@/app/api/payday/new-week/route";
import { PATCH as patchPaydayScreen } from "@/app/api/payday/screen/route";
import { runPayday, setKidsScreenState, startNewWeek } from "@/lib/server/domain/board-service";

function sessionCookie(value: string) {
  return `${SESSION_COOKIE_NAME}=${value}`;
}

function parentToken() {
  return createSessionCookieValue({
    householdId: "chorebank-household",
    actor: "parent",
    userId: "u_parent",
    ttlMs: 60_000,
  });
}

function kidToken() {
  return createSessionCookieValue({
    householdId: "chorebank-household",
    actor: "kid",
    childId: "primary",
    ttlMs: 60_000,
  });
}

describe("payday lifecycle route policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows parent to run payday", async () => {
    const request = new Request("http://localhost:3000/api/payday/run", {
      method: "POST",
      headers: {
        cookie: sessionCookie(parentToken()),
      },
    });

    const response = await postRunPayday(request);
    expect(response.status).toBe(200);
    expect(runPayday).toHaveBeenCalledWith({
      householdSlug: "chorebank-household",
      actorUserId: "u_parent",
    });
  });

  it("rejects kid run payday", async () => {
    const request = new Request("http://localhost:3000/api/payday/run", {
      method: "POST",
      headers: {
        cookie: sessionCookie(kidToken()),
      },
    });

    const response = await postRunPayday(request);
    expect(response.status).toBe(403);
    expect(runPayday).not.toHaveBeenCalled();
  });

  it("allows parent to start new week", async () => {
    const request = new Request("http://localhost:3000/api/payday/new-week", {
      method: "POST",
      headers: {
        cookie: sessionCookie(parentToken()),
      },
    });

    const response = await postNewWeek(request);
    expect(response.status).toBe(200);
    expect(startNewWeek).toHaveBeenCalledWith({
      householdSlug: "chorebank-household",
      actorUserId: "u_parent",
    });
  });

  it("rejects kid start new week", async () => {
    const request = new Request("http://localhost:3000/api/payday/new-week", {
      method: "POST",
      headers: {
        cookie: sessionCookie(kidToken()),
      },
    });

    const response = await postNewWeek(request);
    expect(response.status).toBe(403);
    expect(startNewWeek).not.toHaveBeenCalled();
  });

  it("allows kid to set payday screen and records kid actor", async () => {
    const request = new Request("http://localhost:3000/api/payday/screen", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: sessionCookie(kidToken()),
      },
      body: JSON.stringify({ screen: "celebration" }),
    });

    const response = await patchPaydayScreen(request);
    expect(response.status).toBe(200);
    expect(setKidsScreenState).toHaveBeenCalledWith({
      householdSlug: "chorebank-household",
      screen: "celebration",
      actorType: "KID",
      actorId: "primary",
    });
  });

  it("allows parent to set payday screen and records parent actor", async () => {
    const request = new Request("http://localhost:3000/api/payday/screen", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: sessionCookie(parentToken()),
      },
      body: JSON.stringify({ screen: "closed" }),
    });

    const response = await patchPaydayScreen(request);
    expect(response.status).toBe(200);
    expect(setKidsScreenState).toHaveBeenCalledWith({
      householdSlug: "chorebank-household",
      screen: "closed",
      actorType: "PARENT",
      actorId: "u_parent",
    });
  });
});
