import { describe, expect, it } from "vitest";
import { getCurrentDayIndex, getNextWeekStart, getWeekStart } from "@/lib/server/domain/week";

const HOUSEHOLD_TIME_ZONE = "America/Vancouver";

function getZonedWeekdayAndHour(date: Date, timeZone: string): { weekday: string; hour: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";

  return {
    weekday: read("weekday"),
    hour: Number(read("hour")),
  };
}

describe("week domain helpers", () => {
  it("maps JS day values to board day index (Sat=0..Fri=6)", () => {
    expect(getCurrentDayIndex(new Date("2026-03-07T20:00:00.000Z"), HOUSEHOLD_TIME_ZONE)).toBe(0); // Saturday
    expect(getCurrentDayIndex(new Date("2026-03-08T20:00:00.000Z"), HOUSEHOLD_TIME_ZONE)).toBe(1); // Sunday
    expect(getCurrentDayIndex(new Date("2026-03-09T20:00:00.000Z"), HOUSEHOLD_TIME_ZONE)).toBe(2); // Monday
    expect(getCurrentDayIndex(new Date("2026-03-10T20:00:00.000Z"), HOUSEHOLD_TIME_ZONE)).toBe(3); // Tuesday
    expect(getCurrentDayIndex(new Date("2026-03-11T20:00:00.000Z"), HOUSEHOLD_TIME_ZONE)).toBe(4); // Wednesday
    expect(getCurrentDayIndex(new Date("2026-03-12T20:00:00.000Z"), HOUSEHOLD_TIME_ZONE)).toBe(5); // Thursday
    expect(getCurrentDayIndex(new Date("2026-03-13T20:00:00.000Z"), HOUSEHOLD_TIME_ZONE)).toBe(6); // Friday
  });

  it("returns Saturday week start for any day in week", () => {
    const fromWednesday = getWeekStart(new Date("2026-03-11T20:30:00.000Z"), HOUSEHOLD_TIME_ZONE);
    const fromFriday = getWeekStart(new Date("2026-03-13T08:15:00.000Z"), HOUSEHOLD_TIME_ZONE);

    const wedParts = getZonedWeekdayAndHour(fromWednesday, HOUSEHOLD_TIME_ZONE);
    const friParts = getZonedWeekdayAndHour(fromFriday, HOUSEHOLD_TIME_ZONE);

    expect(wedParts.weekday).toBe("Sat");
    expect(friParts.weekday).toBe("Sat");
    expect(wedParts.hour).toBe(0);
    expect(friParts.hour).toBe(0);
  });

  it("computes next week start as the following Saturday midnight in household timezone", () => {
    const input = getWeekStart(new Date("2026-03-07T12:30:00.000Z"), HOUSEHOLD_TIME_ZONE);
    const next = getNextWeekStart(input, HOUSEHOLD_TIME_ZONE);
    const expected = getWeekStart(new Date("2026-03-14T12:30:00.000Z"), HOUSEHOLD_TIME_ZONE);

    const nextParts = getZonedWeekdayAndHour(next, HOUSEHOLD_TIME_ZONE);
    const expectedParts = getZonedWeekdayAndHour(expected, HOUSEHOLD_TIME_ZONE);

    expect(next.getTime()).toBe(expected.getTime());
    expect(nextParts.weekday).toBe("Sat");
    expect(nextParts.hour).toBe(0);
    expect(expectedParts.weekday).toBe("Sat");
    expect(expectedParts.hour).toBe(0);
  });
});
