import { expect, test } from "@playwright/test";

test("demo mode resets to seed data on refresh", async ({ page }) => {
  test.skip(process.env.LIVE_E2E_CORE_LOOP === "1", "Demo mode is not enabled for the live core-loop check.");
  await page.goto("/?mode=demo");

  const target = page.locator('[data-child-id="primary"][data-row-id="make-bed"][data-day="4"]');
  await expect(target).toHaveClass(/pending/);

  await target.click();
  await expect(target).toHaveClass(/claimed/);

  await page.reload();
  await expect(target).toHaveClass(/pending/);
});
