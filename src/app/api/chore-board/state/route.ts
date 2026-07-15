import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    {
      error: "Legacy endpoint retired. Read board from /api/board.",
      code: "LEGACY_STATE_ENDPOINT_RETIRED",
    },
    { status: 410 },
  );
}

export async function PUT() {
  return NextResponse.json(
    {
      error: "Full-state overwrite is deprecated. Use domain APIs under /api/stars, /api/redemptions, /api/payday, /api/settings.",
      code: "DEPRECATED_FULL_STATE_WRITE",
    },
    { status: 410 },
  );
}
