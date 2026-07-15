import { DomainError } from "@/lib/server/domain/board-service";
import { getSessionContext } from "@/lib/auth/session";
import { isDemoModeAllowed } from "@/lib/server/runtime-mode";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function requireSameOrigin(request: Request, isAuthenticated: boolean) {
  if (!isAuthenticated || !MUTATING_METHODS.has(request.method.toUpperCase())) return;

  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin && fetchSite !== "cross-site") return;

  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || url.host;
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.slice(0, -1);

  try {
    if (fetchSite === "cross-site" || new URL(origin ?? "null").origin !== `${protocol}://${host}`) {
      throw new Error("cross-origin");
    }
  } catch {
    throw new DomainError("Cross-origin request blocked", "CROSS_ORIGIN", 403);
  }
}

export function requireSession(request: Request) {
  const session = getSessionContext(request);

  requireSameOrigin(request, session.isAuthenticated);

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
