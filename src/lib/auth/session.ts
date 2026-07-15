import { createHmac, timingSafeEqual } from "node:crypto";
import { isDemoModeAllowed, isProductionRuntime } from "@/lib/server/runtime-mode";

export type ActorRole = "parent" | "kid";
export type AppMode = "live" | "demo";
export type TenancyMode = "single" | "multi";

export interface SessionTokenPayload {
  householdId: string;
  actor: ActorRole;
  userId?: string;
  childId?: string;
  exp: number;
}

export interface SessionContext {
  mode: AppMode;
  householdId: string;
  actor: ActorRole;
  userId?: string;
  childId?: string;
  isAuthenticated: boolean;
}

export const SESSION_COOKIE_NAME = "chorebank_session";
const DEFAULT_DEV_AUTH_SECRET = "dev-only-insecure-auth-secret-change-me";
const DEFAULT_HOUSEHOLD_SLUG = "chorebank-household";

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (isProductionRuntime()) {
    throw new Error("AUTH_SECRET must be configured in production.");
  }
  return DEFAULT_DEV_AUTH_SECRET;
}

function parseCookies(cookieHeader: string): Record<string, string> {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, entry) => {
      const eqIndex = entry.indexOf("=");
      if (eqIndex <= 0) return acc;
      const key = decodeURIComponent(entry.slice(0, eqIndex));
      const value = decodeURIComponent(entry.slice(eqIndex + 1));
      acc[key] = value;
      return acc;
    }, {});
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function sanitizeHouseholdId(raw: string | null | undefined): string {
  const value = (raw ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  return value.length > 0 ? value : "";
}

export function getTenancyMode(): TenancyMode {
  return process.env.TENANCY_MODE === "multi" ? "multi" : "single";
}

export function getDefaultHouseholdId(): string {
  return sanitizeHouseholdId(process.env.DEFAULT_HOUSEHOLD_ID ?? DEFAULT_HOUSEHOLD_SLUG) || DEFAULT_HOUSEHOLD_SLUG;
}

export function resolveRequestHouseholdId(request: Request, rawHouseholdId?: string | null): string {
  const explicit = sanitizeHouseholdId(rawHouseholdId);
  if (explicit) return explicit;

  const headerValue = sanitizeHouseholdId(request.headers.get("x-household-id"));
  if (headerValue) return headerValue;

  if (getTenancyMode() === "single") {
    return getDefaultHouseholdId();
  }

  return "";
}

export function createSessionToken(payload: SessionTokenPayload): string {
  const headerEncoded = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const bodyEncoded = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(`${headerEncoded}.${bodyEncoded}`, getAuthSecret());
  return `${headerEncoded}.${bodyEncoded}.${signature}`;
}

export function verifySessionToken(token: string): SessionTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerEncoded, bodyEncoded, signature] = parts;
  const expectedSignature = sign(`${headerEncoded}.${bodyEncoded}`, getAuthSecret());

  const signatureBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (signatureBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(bodyEncoded)) as SessionTokenPayload;
    if (!payload || typeof payload !== "object") return null;
    if (payload.exp <= Date.now()) return null;
    if (!payload.householdId || !payload.actor) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getSessionContext(request: Request): SessionContext {
  const url = new URL(request.url);
  const requestedDemo = url.searchParams.get("mode") === "demo";

  if (requestedDemo && isDemoModeAllowed()) {
    return {
      mode: "demo",
      householdId: "demo-household",
      actor: "parent",
      isAuthenticated: true,
    };
  }

  const cookies = parseCookies(request.headers.get("cookie") ?? "");
  const token = cookies[SESSION_COOKIE_NAME];
  if (token) {
    const payload = verifySessionToken(token);
    if (payload) {
      return {
        mode: "live",
        householdId: sanitizeHouseholdId(payload.householdId) || getDefaultHouseholdId(),
        actor: payload.actor,
        userId: payload.userId,
        childId: payload.childId,
        isAuthenticated: true,
      };
    }
  }

  return {
    mode: "live",
    householdId: "",
    actor: "parent",
    isAuthenticated: false,
  };
}

export function createSessionCookieValue({
  householdId,
  actor,
  userId,
  childId,
  ttlMs = 1000 * 60 * 60 * 24 * 7,
}: {
  householdId: string;
  actor: ActorRole;
  userId?: string;
  childId?: string;
  ttlMs?: number;
}): string {
  const normalizedHouseholdId = sanitizeHouseholdId(householdId);
  if (!normalizedHouseholdId) {
    throw new Error("Missing householdId for session cookie.");
  }

  return createSessionToken({
    householdId: normalizedHouseholdId,
    actor,
    userId,
    childId,
    exp: Date.now() + ttlMs,
  });
}
