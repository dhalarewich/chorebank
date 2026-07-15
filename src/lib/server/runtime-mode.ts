export function isProductionRuntime(): boolean {
  if (process.env.VERCEL_ENV) {
    return process.env.VERCEL_ENV === "production";
  }

  return process.env.NODE_ENV === "production";
}

export function isDemoModeAllowed(): boolean {
  return !isProductionRuntime() || process.env.ALLOW_DEMO_MODE === "1";
}
