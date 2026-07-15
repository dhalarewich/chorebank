const DEFAULT_HOUSEHOLD_TIME_ZONE = process.env.HOUSEHOLD_TIME_ZONE ?? "America/Vancouver";

function getZonedParts(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  weekday: string;
  hour: number;
  minute: number;
  second: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    weekday: read("weekday"),
    hour: Number(read("hour")),
    minute: Number(read("minute")),
    second: Number(read("second")),
  };
}

function getWeekdayIndex(weekday: string): number {
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

function getOffsetMs(date: Date, timeZone: string): number {
  const parts = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function createZonedMidnight(year: number, month: number, day: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const offset = getOffsetMs(guess, timeZone);
  return new Date(guess.getTime() - offset);
}

export function getWeekStart(date = new Date(), timeZone = DEFAULT_HOUSEHOLD_TIME_ZONE): Date {
  const zoned = getZonedParts(new Date(date), timeZone);
  const weekday = getWeekdayIndex(zoned.weekday);
  const diffToSaturday = (weekday + 1) % 7;
  const cursor = new Date(Date.UTC(zoned.year, zoned.month - 1, zoned.day));
  cursor.setUTCDate(cursor.getUTCDate() - diffToSaturday);

  return createZonedMidnight(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate(), timeZone);
}

export function normalizeWeekStart(input: Date): Date {
  const value = new Date(input);
  value.setMilliseconds(0);
  return value;
}

export function getCurrentDayIndex(date = new Date(), timeZone = DEFAULT_HOUSEHOLD_TIME_ZONE): number {
  const zoned = getZonedParts(new Date(date), timeZone);
  const jsDay = getWeekdayIndex(zoned.weekday);
  return (jsDay + 1) % 7;
}

export function getNextWeekStart(weekStart: Date, timeZone = DEFAULT_HOUSEHOLD_TIME_ZONE): Date {
  const next = new Date(weekStart);
  next.setUTCDate(next.getUTCDate() + 7);
  return getWeekStart(next, timeZone);
}
