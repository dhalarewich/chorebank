export function isProductionRuntime(): boolean {
  if (process.env.VERCEL_ENV) {
    return process.env.VERCEL_ENV === "production";
  }

  return process.env.NODE_ENV === "production";
}

export function isDemoModeAllowed(): boolean {
  return !isProductionRuntime() || process.env.ALLOW_DEMO_MODE === "1";
}

const PLACEHOLDER_SECRET = /(?:^|[-_ .])(example|dev(?:elopment)?|change[-_ ]?me|replace(?:-with)?|placeholder|default|insecure)(?:$|[-_ .])/i;

export class RuntimeConfigurationError extends Error {}

export function productionSecretError(name: string, value: string | undefined): string | undefined {
  if (!isProductionRuntime()) return undefined;
  if (!value) return `${name} must be configured in production.`;
  if (value.length < 32 || PLACEHOLDER_SECRET.test(value)) {
    return `${name} must be at least 32 characters and not use an example, development, or change-me value.`;
  }
}
