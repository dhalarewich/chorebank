import { NextResponse } from "next/server";
import { DomainError } from "@/lib/server/domain/board-service";
import { reportError } from "@/lib/observability/errors";

export function errorResponse(error: unknown, context?: Record<string, unknown>) {
  const requestId = crypto.randomUUID();

  if (error instanceof DomainError) {
    reportError(error, { requestId, code: error.code, ...context });
    return NextResponse.json({ error: error.message, code: error.code, requestId }, { status: error.status });
  }

  reportError(error, { requestId, ...context });
  return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR", requestId }, { status: 500 });
}
