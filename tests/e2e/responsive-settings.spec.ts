import { expect, test } from "@playwright/test";

test("settings navigation stays visible without page overflow", async ({ page }) => {
  test.skip(process.env.LIVE_E2E_CORE_LOOP === "1", "Demo mode is not enabled for the live core-loop check.");
  await page.goto("/parent/settings/children?mode=demo");

  for (const label of ["Children", "Chores", "Rewards", "Household", "App"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
  }
  const dimensions = await page.locator("html").evaluate((node) => ({ clientWidth: node.clientWidth, scrollWidth: node.scrollWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});
