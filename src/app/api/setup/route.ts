import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createHouseholdSetup, householdSetupSchema, householdSlugSchema, SetupError } from "@/lib/server/setup";
import { productionSecretError } from "@/lib/server/runtime-mode";

export const runtime = "nodejs";

const requestSchema = householdSetupSchema.extend({ setupToken: z.string().min(1) });

function validToken(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function POST(request: Request) {
  const configuredToken = process.env.SETUP_TOKEN;
  const configurationError = productionSecretError("SETUP_TOKEN", configuredToken);
  if (configurationError) return NextResponse.json({ error: configurationError }, { status: 503 });
  if (!configuredToken) return NextResponse.json({ error: "Browser setup is not configured." }, { status: 503 });

  try {
    const input = requestSchema.parse(await request.json());
    if (!validToken(input.setupToken, configuredToken)) {
      return NextResponse.json({ error: "Invalid setup token." }, { status: 401 });
    }

    const configuredSlug = householdSlugSchema.parse(process.env.DEFAULT_HOUSEHOLD_ID);
    await createHouseholdSetup(input, configuredSlug);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid setup values." }, { status: 400 });
    }
    if (error instanceof SetupError) {
      return NextResponse.json({ error: error.message }, { status: error.code === "ALREADY_CONFIGURED" ? 409 : 400 });
    }
    console.error("Household setup failed", error);
    return NextResponse.json({ error: "Setup failed. Try again." }, { status: 500 });
  }
}
