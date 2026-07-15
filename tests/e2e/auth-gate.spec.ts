import { expect, test } from "@playwright/test";

test("root route requires auth in live mode", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.locator(".auth-title")).toContainText("Chorebank");
});
