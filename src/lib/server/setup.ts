import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/server/prisma";

const starterChores = [
  ["make-bed", "Make Bed", "🛏️"],
  ["brush-teeth", "Brush Teeth", "🪥"],
  ["tidy-up", "Tidy Up", "✨"],
] as const;

const starterRewards = [
  ["pick-dinner", "Pick Dinner", "🍽️", "Choose dinner for the family.", 10],
  ["screen-time", "Screen Time", "📺", "Extra screen time.", 15],
] as const;

function validTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const householdSlugSchema = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens.");

export const householdSetupSchema = z.object({
  householdName: z.string().trim().min(2).max(80),
  householdSlug: householdSlugSchema,
  timeZone: z.string().trim().refine(validTimeZone, "Enter a valid IANA timezone, such as America/Vancouver."),
  parentEmail: z.email().trim().transform((value) => value.toLowerCase()),
  parentPassword: z.string().min(12).refine((value) => !/^(password|changeme|default)$/i.test(value), "Choose a non-default password."),
  kidPin: z.string().regex(/^\d{4,12}$/, "Use 4–12 digits."),
  childName: z.string().trim().min(1).max(80),
  addStarterData: z.boolean(),
});

export type HouseholdSetupInput = z.input<typeof householdSetupSchema>;

export class SetupError extends Error {
  constructor(
    message: string,
    readonly code: "ALREADY_CONFIGURED" | "SLUG_MISMATCH",
  ) {
    super(message);
  }
}

function slug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getWeekStart(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const daysSinceSaturday = { Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6, Sat: 0 }[read("weekday") as "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat"];
  const date = new Date(Date.UTC(Number(read("year")), Number(read("month")) - 1, Number(read("day")) - daysSinceSaturday));
  const local = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const localRead = (type: Intl.DateTimeFormatPartTypes) => local.find((part) => part.type === type)?.value;
  const localAsUtc = Date.UTC(Number(localRead("year")), Number(localRead("month")) - 1, Number(localRead("day")), Number(localRead("hour")), Number(localRead("minute")), Number(localRead("second")));
  return new Date(date.getTime() - (localAsUtc - date.getTime()));
}

export async function createHouseholdSetup(rawInput: HouseholdSetupInput, expectedHouseholdSlug?: string) {
  const input = householdSetupSchema.parse(rawInput);
  if (expectedHouseholdSlug && input.householdSlug !== expectedHouseholdSlug) {
    throw new SetupError(`Household slug must match DEFAULT_HOUSEHOLD_ID (${expectedHouseholdSlug}).`, "SLUG_MISMATCH");
  }

  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: input.timeZone, weekday: "short" }).format(new Date());
  const currentDay = { Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6, Sat: 0 }[weekday as "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat"];
  const weekStart = getWeekStart(input.timeZone);
  const [passwordHash, pinHash] = await Promise.all([bcrypt.hash(input.parentPassword, 10), bcrypt.hash(input.kidPin, 10)]);

  return prisma.$transaction(
    async (tx) => {
      if (await tx.household.count()) {
        throw new SetupError("Setup stopped: existing household data was found. Chorebank never resets data from setup.", "ALREADY_CONFIGURED");
      }

      const household = await tx.household.create({
        data: { slug: input.householdSlug, name: input.householdName, timeZone: input.timeZone, currentDay, currentWeekStart: weekStart },
      });
      await tx.appSettings.create({ data: { householdId: household.id, demoModeEnabled: false } });
      await tx.user.create({
        data: { householdId: household.id, email: input.parentEmail, displayName: "Parent", passwordHash },
      });
      const child = await tx.child.create({
        data: { householdId: household.id, slug: slug(input.childName) || "child", name: input.childName, age: 0, avatar: "🧒", accent: "#4F46E5", pinHash },
      });

      if (input.addStarterData) {
        for (const [sortOrder, [choreSlug, label, icon]] of starterChores.entries()) {
          const chore = await tx.choreTemplate.create({ data: { householdId: household.id, childId: child.id, slug: choreSlug, label, icon, sortOrder } });
          await tx.choreDayStatus.createMany({
            data: Array.from({ length: 7 }, (_, dayIndex) => ({
              householdId: household.id,
              childId: child.id,
              choreTemplateId: chore.id,
              weekStart,
              dayIndex,
              status: dayIndex < currentDay ? "EMPTY" : "FUTURE",
            })),
          });
        }
        for (const [sortOrder, [rewardSlug, name, icon, description, cost]] of starterRewards.entries()) {
          await tx.rewardItem.create({ data: { householdId: household.id, slug: rewardSlug, name, icon, description, cost, sortOrder } });
        }
      }

      await tx.auditEvent.create({
        data: { householdId: household.id, actorType: "SYSTEM", eventType: "HOUSEHOLD_SETUP", payload: { starterConfiguration: input.addStarterData } },
      });
      return { householdId: household.id, householdSlug: household.slug };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
