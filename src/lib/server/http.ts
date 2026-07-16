import { NextResponse } from "next/server";
import { DomainError } from "@/lib/server/domain/board-service";
import { reportError } from "@/lib/observability/errors";
import { RuntimeConfigurationError } from "@/lib/server/runtime-mode";

export function errorResponse(error: unknown, context?: Record<string, unknown>) {
  const requestId = crypto.randomUUID();

  if (error instanceof RuntimeConfigurationError) {
    reportError(error, { requestId, code: "CONFIGURATION_ERROR", ...context });
    return NextResponse.json({ error: error.message, code: "CONFIGURATION_ERROR", requestId }, { status: 503 });
  }

  if (error instanceof DomainError) {
    reportError(error, { requestId, code: error.code, ...context });
    return NextResponse.json({ error: error.message, code: error.code, requestId }, { status: error.status });
  }

  reportError(error, { requestId, ...context });
  return NextResponse.json({ error: "Internal server error", code: "INTERNAL_ERROR", requestId }, { status: 500 });
}
