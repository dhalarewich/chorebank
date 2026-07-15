const DEFAULT_CHILD_ACCENTS: Record<string, string> = {
  primary: "#E47B3A",
  secondary: "#E06B96",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeHex(value: string): string | null {
  const trimmed = value.trim();
  const hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return `#${hex.toUpperCase()}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "");
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return { r, g, b };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0").toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixHex(from: string, to: string, weightTo: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const weight = clamp(weightTo, 0, 1);
  const r = a.r + (b.r - a.r) * weight;
  const g = a.g + (b.g - a.g) * weight;
  const bl = a.b + (b.b - a.b) * weight;
  return rgbToHex(r, g, bl);
}

export function resolveChildAccent(value: string | undefined, childId?: string): string {
  const normalizedKey = value?.trim().toLowerCase();
  if (normalizedKey && DEFAULT_CHILD_ACCENTS[normalizedKey]) {
    return DEFAULT_CHILD_ACCENTS[normalizedKey];
  }

  const normalized = value ? normalizeHex(value) : null;
  if (normalized) return normalized;

  const byId = childId ? DEFAULT_CHILD_ACCENTS[childId] : undefined;
  if (byId) return byId;
  return "#4A8BB5";
}

export function generateChildPalette(value: string | undefined, childId?: string) {
  const base = resolveChildAccent(value, childId);
  const tint = (amount: number) => mixHex(base, "#FFFFFF", amount);
  const shade = (amount: number) => mixHex(base, "#000000", amount);

  return {
    600: shade(0.16),
    500: base,
    400: tint(0.28),
    300: tint(0.52),
    200: tint(0.82),
    100: tint(0.92),
  } as const;
}
