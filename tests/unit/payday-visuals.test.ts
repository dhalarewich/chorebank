import { describe, expect, it } from "vitest";
import { createPaydayCoinLayout } from "@/lib/chore-board/payday-visuals";

describe("createPaydayCoinLayout", () => {
  it("builds a deterministic, bounded pile with visible interest coins", () => {
    const input = { width: 420, height: 240, stars: 30, interest: 2, seed: 73 };
    const first = createPaydayCoinLayout(input);

    expect(first).toEqual(createPaydayCoinLayout(input));
    expect(first).toHaveLength(30);
    expect(first.some((coin) => coin.interest)).toBe(true);
    expect(first.every((coin) => Math.abs(coin.endX) < input.width / 2 && coin.endY > 0 && coin.endY < input.height)).toBe(true);
  });

  it("returns an empty pile when nothing was earned", () => {
    expect(createPaydayCoinLayout({ width: 320, height: 220, stars: 0, interest: 0, seed: 1 })).toEqual([]);
  });
});
