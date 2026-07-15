import { describe, expect, it } from "vitest";
import { householdSetupSchema } from "@/lib/server/setup";

const validSetup = {
  householdName: "Rivera Family",
  householdSlug: "rivera-home",
  timeZone: "America/Vancouver",
  parentEmail: "Parent@Example.com",
  parentPassword: "a-secure-password",
  kidPin: "1234",
  childName: "Alex",
  addStarterData: true,
};

describe("household setup input", () => {
  it("normalizes the parent email", () => {
    expect(householdSetupSchema.parse(validSetup).parentEmail).toBe("parent@example.com");
  });

  it("rejects invalid timezones, weak passwords, and non-numeric PINs", () => {
    expect(householdSetupSchema.safeParse({ ...validSetup, timeZone: "Moon/Base" }).success).toBe(false);
    expect(householdSetupSchema.safeParse({ ...validSetup, parentPassword: "password" }).success).toBe(false);
    expect(householdSetupSchema.safeParse({ ...validSetup, kidPin: "12ab" }).success).toBe(false);
  });
});
