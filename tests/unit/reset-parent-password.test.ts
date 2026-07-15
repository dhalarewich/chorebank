import { describe, expect, it } from "vitest";

describe("parent password reset input", () => {
  it("accepts only listed account numbers and strong-enough passwords", async () => {
    const { parseSelection, validPassword } = await import("../../scripts/reset-parent-password.mjs");

    expect(parseSelection("2", 3)).toBe(1);
    expect(parseSelection("0", 3)).toBe(-1);
    expect(parseSelection("2.5", 3)).toBe(-1);
    expect(validPassword("short")).toBe(false);
    expect(validPassword("twelve-chars+" )).toBe(true);
  });
});
