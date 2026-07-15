import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { askSecret } from "./setup-prompt.mjs";

const prisma = new PrismaClient();
const starterChores = [
  ["make-bed", "Make Bed", "🛏️"],
  ["brush-teeth", "Brush Teeth", "🪥"],
  ["tidy-up", "Tidy Up", "✨"],
];
const starterRewards = [
  ["pick-dinner", "Pick Dinner", "🍽️", "Choose dinner for the family.", 10],
  ["screen-time", "Screen Time", "📺", "Extra screen time.", 15],
];

function slug(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function validTimeZone(value) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function getWeekStart(timeZone, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(now);
  const read = (type) => parts.find((part) => part.type === type)?.value;
  const daysSinceSaturday = { Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6, Sat: 0 }[read("weekday")];
  const date = new Date(Date.UTC(Number(read("year")), Number(read("month")) - 1, Number(read("day")) - daysSinceSaturday));
  const local = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const localRead = (type) => local.find((part) => part.type === type)?.value;
  const localAsUtc = Date.UTC(Number(localRead("year")), Number(localRead("month")) - 1, Number(localRead("day")), Number(localRead("hour")), Number(localRead("minute")), Number(localRead("second")));
  return new Date(date.getTime() - (localAsUtc - date.getTime()));
}

async function askUntil(rl, label, validate, secret = false) {
  for (;;) {
    const value = secret
      ? await askSecret({ input, output, question: (prompt) => rl.question(prompt) }, label)
      : (await rl.question(`${label}: `)).trim();
    if (validate(value)) return value;
    output.write(secret ? "Enter a valid non-default value.\n" : "That value is not valid. Try again.\n");
  }
}

async function main() {
  if (await prisma.household.count()) {
    throw new Error("Setup stopped: existing household data was found. Chorebank never resets data from setup.");
  }

  const rl = createInterface({ input, output });
  try {
    output.write("Create your Chorebank household. Values are stored only in PostgreSQL.\n");
    const name = await askUntil(rl, "Household name", (value) => value.length >= 2 && value.length <= 80);
    const householdSlug = await askUntil(rl, "Household slug (lowercase letters, numbers, hyphens)", (value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value));
    const timeZone = await askUntil(rl, "Household timezone (for example America/Vancouver)", validTimeZone);
    const email = await askUntil(rl, "Parent email", (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
    const password = await askUntil(rl, "Parent password (12+ characters)", (value) => value.length >= 12 && !/^(password|changeme|default)$/i.test(value), true);
    const pin = await askUntil(rl, "Kid PIN (4-12 digits)", (value) => /^\d{4,12}$/.test(value), true);
    const childName = await askUntil(rl, "First child's display name", (value) => value.length >= 1 && value.length <= 80);
    const starter = await askUntil(rl, "Add generic starter chores and rewards? (yes/no)", (value) => /^(yes|no)$/i.test(value));
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(new Date());
    const currentDay = { Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6, Sat: 0 }[weekday];
    const date = getWeekStart(timeZone);
    const [passwordHash, pinHash] = await Promise.all([bcrypt.hash(password, 10), bcrypt.hash(pin, 10)]);

    await prisma.$transaction(async (tx) => {
      const household = await tx.household.create({ data: { slug: householdSlug, name, timeZone, currentDay, currentWeekStart: date } });
      await tx.appSettings.create({ data: { householdId: household.id, demoModeEnabled: false } });
      await tx.user.create({ data: { householdId: household.id, email: email.toLowerCase(), displayName: "Parent", passwordHash } });
      const child = await tx.child.create({ data: { householdId: household.id, slug: slug(childName) || "child", name: childName, age: 0, avatar: "🧒", accent: "#4F46E5", pinHash } });
      if (/^yes$/i.test(starter)) {
        for (const [sortOrder, [choreSlug, label, icon]] of starterChores.entries()) {
          const chore = await tx.choreTemplate.create({ data: { householdId: household.id, childId: child.id, slug: choreSlug, label, icon, sortOrder } });
          await tx.choreDayStatus.createMany({ data: Array.from({ length: 7 }, (_, dayIndex) => ({ householdId: household.id, childId: child.id, choreTemplateId: chore.id, weekStart: date, dayIndex, status: dayIndex < currentDay ? "EMPTY" : "FUTURE" })) });
        }
        for (const [sortOrder, [rewardSlug, rewardName, icon, description, cost]] of starterRewards.entries()) {
          await tx.rewardItem.create({ data: { householdId: household.id, slug: rewardSlug, name: rewardName, icon, description, cost, sortOrder } });
        }
      }
      await tx.auditEvent.create({ data: { householdId: household.id, actorType: "SYSTEM", eventType: "HOUSEHOLD_SETUP", payload: { starterConfiguration: /^yes$/i.test(starter) } } });
    });
    output.write(`Setup complete. Set DEFAULT_HOUSEHOLD_ID=${householdSlug} in your environment, then sign in at /auth.\n`);
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
