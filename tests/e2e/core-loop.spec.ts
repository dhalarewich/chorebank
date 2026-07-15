import { expect, test, type Page } from "@playwright/test";

const runLiveCoreLoop = process.env.LIVE_E2E_CORE_LOOP === "1";

interface BoardPayload {
  state: {
    currentDay: number;
    kidsScreen: "active" | "paydayReady" | "celebration" | "closed";
    children: Array<{
      id: string;
      coins: number;
      chores: Array<{
        id: string;
        cells: Array<"empty" | "future" | "pending" | "claimed">;
      }>;
      bonus: Array<"empty" | "future" | "pending" | "claimed">;
    }>;
    redemptions: Array<{
      id: string;
      childId: string;
      status: "pending" | "fulfilled";
      createdAt: number;
    }>;
  };
}

interface RewardsPayload {
  rewards: Array<{ id: string; cost: number }>;
}

async function loginParent(page: Page) {
  await page.goto("/auth");
  await page.getByRole("button", { name: "Parent", exact: true }).click();
  await page.fill("#parent-email", "parent@example.test");
  await page.fill("#parent-password", "test-password");
  await page.getByRole("button", { name: "Sign In as Parent" }).click();
  await expect(page).toHaveURL(/\/parent$/);
}

async function loginKid(page: Page) {
  await page.goto("/auth");
  await page.getByRole("button", { name: "Kid", exact: true }).click();
  await page.fill("#kid-pin", "1234");
  await page.getByRole("button", { name: "Enter as Kid" }).click();
  await expect(page).toHaveURL(/\/kids$/);
}

async function logout(page: Page) {
  await page.request.post("/api/auth/session", {
    data: { action: "logout" },
  });
}

(runLiveCoreLoop ? test : test.skip)("live core loop: auth -> award -> claim -> redeem -> fulfill -> payday -> next week", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The live flow mutates shared household data and runs once.");
  await loginParent(page);

  let boardResponse = await page.request.get("/api/board");
  expect(boardResponse.ok()).toBeTruthy();
  let board = (await boardResponse.json()) as BoardPayload;

  if (board.state.kidsScreen === "paydayReady" || board.state.kidsScreen === "celebration") {
    const closeResponse = await page.request.patch("/api/payday/screen", { data: { screen: "closed" } });
    expect(closeResponse.ok()).toBeTruthy();
  }
  if (board.state.kidsScreen === "closed") {
    const newWeekResponse = await page.request.post("/api/payday/new-week");
    expect(newWeekResponse.ok()).toBeTruthy();
  }

  boardResponse = await page.request.get("/api/board");
  expect(boardResponse.ok()).toBeTruthy();
  board = (await boardResponse.json()) as BoardPayload;

  const child = board.state.children[0];
  expect(child).toBeTruthy();

  let selectedRowId: string | null = null;
  let selectedDay = 0;
  for (const chore of child.chores) {
    const day = chore.cells.findIndex((status, index) => index <= board.state.currentDay && status === "empty");
    if (day !== -1) {
      selectedRowId = chore.id;
      selectedDay = day;
      break;
    }
  }

  if (!selectedRowId) {
    const fallbackRow = child.chores[0];
    expect(fallbackRow).toBeTruthy();
    selectedRowId = fallbackRow.id;
    selectedDay = Math.min(board.state.currentDay, 6);
  }

  const awardResponse = await page.request.post("/api/stars/award", {
    data: {
      childId: child.id,
      rowId: selectedRowId,
      day: selectedDay,
      isBonus: false,
    },
  });
  expect(awardResponse.ok()).toBeTruthy();

  await logout(page);
  await loginKid(page);

  const claimResponse = await page.request.post("/api/stars/claim", {
    data: {
      childId: child.id,
      rowId: selectedRowId,
      day: selectedDay,
      isBonus: false,
    },
  });
  expect(claimResponse.ok()).toBeTruthy();

  const rewardsResponse = await page.request.get("/api/rewards");
  expect(rewardsResponse.ok()).toBeTruthy();
  const rewards = (await rewardsResponse.json()) as RewardsPayload;

  const boardAfterClaim = ((await page.request.get("/api/board").then((res) => res.json())) as BoardPayload).state;
  const updatedChild = boardAfterClaim.children.find((entry) => entry.id === child.id);
  expect(updatedChild).toBeTruthy();

  const affordableReward = rewards.rewards
    .slice()
    .sort((a, b) => a.cost - b.cost)
    .find((reward) => reward.cost <= (updatedChild?.coins ?? 0));
  expect(affordableReward).toBeTruthy();

  const requestRedemptionResponse = await page.request.post("/api/redemptions/request", {
    data: {
      childId: child.id,
      rewardId: affordableReward?.id,
    },
  });
  expect(requestRedemptionResponse.ok()).toBeTruthy();

  await logout(page);
  await loginParent(page);

  const boardAfterRequest = ((await page.request.get("/api/board").then((res) => res.json())) as BoardPayload).state;
  const pendingForChild = boardAfterRequest.redemptions
    .filter((entry) => entry.childId === child.id && entry.status === "pending")
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  expect(pendingForChild).toBeTruthy();

  const fulfillResponse = await page.request.post("/api/redemptions/fulfill", {
    data: { redemptionId: pendingForChild?.id },
  });
  expect(fulfillResponse.ok()).toBeTruthy();

  const paydayResponse = await page.request.post("/api/payday/run");
  expect(paydayResponse.ok()).toBeTruthy();
  const paydayBody = (await paydayResponse.json()) as BoardPayload;
  expect(paydayBody.state.kidsScreen).toBe("paydayReady");

  const closePaydayResponse = await page.request.patch("/api/payday/screen", {
    data: { screen: "closed" },
  });
  expect(closePaydayResponse.ok()).toBeTruthy();

  const nextWeekResponse = await page.request.post("/api/payday/new-week");
  expect(nextWeekResponse.ok()).toBeTruthy();
  const nextWeekBody = (await nextWeekResponse.json()) as BoardPayload;
  expect(nextWeekBody.state.kidsScreen).toBe("active");
});
