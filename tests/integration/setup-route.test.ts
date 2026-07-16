import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/setup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/setup")>()),
  createHouseholdSetup: vi.fn(),
}));

import { POST } from "@/app/api/setup/route";
import { createHouseholdSetup, SetupError } from "@/lib/server/setup";

const setup = {
  setupToken: "setup-token",
  householdName: "Rivera Family",
  householdSlug: "home",
  timeZone: "America/Vancouver",
  parentEmail: "parent@example.com",
  parentPassword: "a-secure-password",
  kidPin: "1234",
  childName: "Alex",
  addStarterData: true,
};

describe("POST /api/setup", () => {
  const environment = { ...process.env };

  beforeEach(() => {
    process.env.SETUP_TOKEN = "setup-token";
    process.env.DEFAULT_HOUSEHOLD_ID = "home";
    vi.mocked(createHouseholdSetup).mockResolvedValue({ householdId: "h_1", householdSlug: "home" });
  });

  afterEach(() => {
    process.env = { ...environment };
    vi.clearAllMocks();
  });

  it("requires the setup token and passes the canonical slug to the shared service", async () => {
    const denied = await POST(new Request("http://localhost/api/setup", { method: "POST", body: JSON.stringify({ ...setup, setupToken: "wrong" }) }));
    expect(denied.status).toBe(401);

    const response = await POST(new Request("http://localhost/api/setup", { method: "POST", body: JSON.stringify(setup) }));
    expect(response.status).toBe(201);
    expect(createHouseholdSetup).toHaveBeenCalledWith(expect.objectContaining({ householdSlug: "home" }), "home");
  });

  it("rejects a slug that does not match DEFAULT_HOUSEHOLD_ID", async () => {
    vi.mocked(createHouseholdSetup).mockRejectedValue(new SetupError("Household slug must match DEFAULT_HOUSEHOLD_ID (home).", "SLUG_MISMATCH"));
    const response = await POST(new Request("http://localhost/api/setup", { method: "POST", body: JSON.stringify({ ...setup, householdSlug: "other-home" }) }));
    expect(response.status).toBe(400);
    expect(createHouseholdSetup).toHaveBeenCalledWith(expect.objectContaining({ householdSlug: "other-home" }), "home");
  });

  it("rejects short or placeholder setup tokens in production", async () => {
    process.env = { ...process.env, NODE_ENV: "production" };
    delete process.env.VERCEL_ENV;
    process.env.SETUP_TOKEN = `replace-with-a-setup-token-${"a".repeat(32)}`;

    const response = await POST(new Request("http://localhost/api/setup", { method: "POST", body: JSON.stringify(setup) }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringMatching(/SETUP_TOKEN must be at least 32 characters/) });
  });
});
