import { DomainError } from "@/lib/server/domain/board-service";
import { getSessionContext } from "@/lib/auth/session";
import { isDemoModeAllowed } from "@/lib/server/runtime-mode";

export function requireSession(request: Request) {
  const session = getSessionContext(request);

  if (new URL(request.url).searchParams.get("mode") === "demo" && !isDemoModeAllowed()) {
    throw new DomainError("Demo mode is disabled in production", "DEMO_DISABLED", 403);
  }

  if (session.mode === "live" && !session.isAuthenticated) {
    throw new DomainError("Authentication required", "UNAUTHENTICATED", 401);
  }

  if (!session.householdId) {
    throw new DomainError("Missing household context", "NO_HOUSEHOLD", 400);
  }

  return session;
}

export function requireParent(session: ReturnType<typeof requireSession>) {
  if (session.mode === "demo") return;
  if (session.actor !== "parent") {
    throw new DomainError("Parent role required", "FORBIDDEN", 403);
  }
}

export function requireKid(session: ReturnType<typeof requireSession>) {
  if (session.mode === "demo") return;
  if (session.actor !== "kid") {
    throw new DomainError("Kid role required", "FORBIDDEN", 403);
  }
}
