import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/domain/board-service", () => ({
  verifyParentLogin: vi.fn(),
  verifyKidPin: vi.fn(),
}));

import { POST } from "@/app/api/auth/session/route";
import { verifyKidPin, verifyParentLogin } from "@/lib/server/domain/board-service";

describe("POST /api/auth/session", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates parent session cookie after login", async () => {
    vi.mocked(verifyParentLogin).mockResolvedValue({ userId: "u_1", householdId: "chorebank-household" });

    const request = new Request("http://localhost:3000/api/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "parent-login",
        email: "parent@example.test",
        password: "test-password",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("chorebank_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).not.toContain("Secure");
  });

  it("marks session cookies secure behind HTTPS", async () => {
    vi.mocked(verifyParentLogin).mockResolvedValue({ userId: "u_1", householdId: "chorebank-household" });

    const request = new Request("http://localhost:3000/api/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-proto": "https" },
      body: JSON.stringify({ action: "parent-login", email: "parent@example.test", password: "test-password" }),
    });

    const response = await POST(request);
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("creates kid session cookie after PIN login", async () => {
    vi.mocked(verifyKidPin).mockResolvedValue({ childId: "primary", householdId: "chorebank-household" });

    const request = new Request("http://localhost:3000/api/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "kid-pin",
        pin: "1234",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("chorebank_session=");
  });
});
