import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { z } from "zod";
import { createHouseholdSetup, householdSetupSchema, householdSlugSchema } from "../src/lib/server/setup";
import { prisma } from "../src/lib/server/prisma";
import { askSecret } from "./setup-prompt.mjs";

async function askUntil(label: string, validate: (value: string) => boolean, secret = false) {
  for (;;) {
    const value = secret
      ? await askSecret({ input, output, question: (prompt: string) => rl.question(prompt) }, label)
      : (await rl.question(`${label}: `)).trim();
    if (validate(value)) return value;
    output.write(secret ? "Enter a valid non-default value.\n" : "That value is not valid. Try again.\n");
  }
}

const rl = createInterface({ input, output });

async function main() {
  const configuredSlug = householdSlugSchema.parse(process.env.DEFAULT_HOUSEHOLD_ID);
  output.write("Create your Chorebank household. Values are stored only in PostgreSQL.\n");
  const householdName = await askUntil("Household name", (value) => value.length >= 2 && value.length <= 80);
  const householdSlug = configuredSlug;
  output.write(`Household slug: ${householdSlug} (from DEFAULT_HOUSEHOLD_ID)\n`);
  const timeZone = await askUntil("Household timezone (for example America/Vancouver)", (value) => householdSetupSchema.shape.timeZone.safeParse(value).success);
  const parentEmail = await askUntil("Parent email", (value) => z.email().safeParse(value).success);
  const parentPassword = await askUntil("Parent password (12+ characters)", (value) => value.length >= 12 && !/^(password|changeme|default)$/i.test(value), true);
  const kidPin = await askUntil("Kid PIN (4-12 digits)", (value) => /^\d{4,12}$/.test(value), true);
  const childName = await askUntil("First child's display name", (value) => value.length >= 1 && value.length <= 80);
  const starter = await askUntil("Add generic starter chores and rewards? (yes/no)", (value) => /^(yes|no)$/i.test(value));

  await createHouseholdSetup({
    householdName,
    householdSlug,
    timeZone,
    parentEmail,
    parentPassword,
    kidPin,
    childName,
    addStarterData: /^yes$/i.test(starter),
  }, configuredSlug);
  output.write("Setup complete. Sign in at /auth.\n");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Setup failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    rl.close();
    await prisma.$disconnect();
  });
