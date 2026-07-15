import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";

describe("askSecret", () => {
  it("does not write typed secret characters to a TTY", async () => {
    const { askSecret } = await import("../../scripts/setup-prompt.mjs");
    const input = Object.assign(new EventEmitter(), { isTTY: true, isRaw: false, resume() {}, setRawMode: (value: boolean) => { input.isRaw = value; } });
    let written = "";
    const secret = askSecret({ input, output: { write: (value: string) => { written += value; } }, question: async () => "" }, "Password");
    input.emit("data", Buffer.from("not-printed\n"));
    await expect(secret).resolves.toBe("not-printed");
    expect(written).toBe("Password: \n");
    expect(input.isRaw).toBe(false);
  });
});
