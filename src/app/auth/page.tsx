import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/server/prisma";

export const dynamic = "force-dynamic";

export default async function AuthPage() {
  if (!(await prisma.household.count())) {
    redirect("/setup");
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const payload = token ? verifySessionToken(token) : null;

  if (payload) {
    redirect(payload.actor === "parent" ? "/parent" : "/kids");
  }

  return <AuthScreen />;
}
