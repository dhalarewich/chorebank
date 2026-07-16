import { redirect } from "next/navigation";
import { SetupScreen } from "@/components/setup/SetupScreen";
import { householdSlugSchema } from "@/lib/server/setup";
import { prisma } from "@/lib/server/prisma";
import { productionSecretError } from "@/lib/server/runtime-mode";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await prisma.household.count()) redirect("/auth");

  const slug = householdSlugSchema.safeParse(process.env.DEFAULT_HOUSEHOLD_ID);
  const configurationError = productionSecretError("SETUP_TOKEN", process.env.SETUP_TOKEN) ?? (!process.env.SETUP_TOKEN
    ? "SETUP_TOKEN is not configured. Add it to the app service and redeploy."
    : !slug.success
      ? "DEFAULT_HOUSEHOLD_ID must contain lowercase letters, numbers, and hyphens."
      : undefined);

  return <SetupScreen householdSlug={slug.success ? slug.data : ""} configurationError={configurationError} />;
}
