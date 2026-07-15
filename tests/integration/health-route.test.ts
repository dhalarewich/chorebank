import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/prisma", () => ({
  prisma: { $queryRaw: vi.fn() },
}));

import { GET } from "@/app/api/health/route";
import { prisma } from "@/lib/server/prisma";

describe("GET /api/health", () => {
  beforeEach(() => vi.resetAllMocks());

  it("reports a working database", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ ok: 1 }]);
    expect((await GET()).status).toBe(200);
  });

  it("fails health checks when the database is unavailable", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("offline"));
    expect((await GET()).status).toBe(503);
  });
});
