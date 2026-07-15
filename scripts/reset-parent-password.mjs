import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { askSecret } from "./setup-prompt.mjs";

export function parseSelection(value, count) {
  const selected = Number(value);
  return Number.isInteger(selected) && selected >= 1 && selected <= count ? selected - 1 : -1;
}

export function validPassword(value) {
  return value.length >= 12 && !/^(password|changeme|default)$/i.test(value);
}

async function main() {
  const prisma = new PrismaClient();
  const rl = createInterface({ input, output });

  try {
    const households = await prisma.household.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        users: { orderBy: { createdAt: "asc" }, select: { id: true, displayName: true, email: true } },
      },
    });
    const choices = households.flatMap((household) => household.users.map((user) => ({ household, user })));
    if (!choices.length) throw new Error("No parent accounts were found.");

    output.write("Select the parent account to reset:\n");
    choices.forEach(({ household, user }, index) => {
      output.write(`${index + 1}. ${household.name} (${household.slug}) — ${user.displayName} <${user.email}>\n`);
    });

    let selected = -1;
    while (selected < 0) {
      selected = parseSelection((await rl.question("Account number: ")).trim(), choices.length);
      if (selected < 0) output.write("Enter one of the listed account numbers.\n");
    }
    const choice = choices[selected];
    const confirmation = (await rl.question(`Type ${choice.user.email} to confirm: `)).trim();
    if (confirmation !== choice.user.email) throw new Error("Password reset cancelled: account confirmation did not match.");

    let password = "";
    while (!validPassword(password)) {
      password = await askSecret({ input, output, question: (prompt) => rl.question(prompt) }, "New password (12+ characters)");
      if (!validPassword(password)) output.write("Enter a valid non-default value.\n");
    }
    const repeated = await askSecret({ input, output, question: (prompt) => rl.question(prompt) }, "Repeat new password");
    if (password !== repeated) throw new Error("Password reset cancelled: passwords did not match.");

    const passwordHash = await bcrypt.hash(password, 10);
    if (!(await bcrypt.compare(password, passwordHash))) throw new Error("Password hashing validation failed; no changes were made.");
    const result = await prisma.user.updateMany({
      where: { id: choice.user.id, householdId: choice.household.id },
      data: { passwordHash },
    });
    if (result.count !== 1) throw new Error("The selected account changed before it could be updated; no password was reset.");
    output.write(`Password reset for ${choice.user.email}.\n`);
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
