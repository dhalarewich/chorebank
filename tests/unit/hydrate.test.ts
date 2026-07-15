import { describe, expect, it } from "vitest";
import { createInitialState } from "@/lib/chore-board/defaults";
import { applyLiveBoardToState, toLiveBoardPayloadFromState } from "@/lib/chore-board/hydrate";

describe("hydrate live board payload", () => {
  it("applies board domain data into app state", () => {
    const base = createInitialState();
    const payload = toLiveBoardPayloadFromState(base);

    payload.currentDay = 6;
    payload.interestRate = 20;
    payload.children[0].coins = 99;

    const result = applyLiveBoardToState(base, payload);

    expect(result.currentDay).toBe(6);
    expect(result.interestRate).toBe(20);
    expect(result.children[0].coins).toBe(99);
    expect(result.celebrationSeed).toBeTypeOf("number");
  });
});
