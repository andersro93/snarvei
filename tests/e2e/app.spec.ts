import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const unique = () => crypto.randomUUID().slice(0, 8);

const clickTestIdButton = async (page: Page, testId: string) => {
  const button = page.getByTestId(testId);
  await expect(button).toBeEnabled();
  await button.click();
};

test("landing page renders product messaging", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Short links you can trust long after they are shared.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("Cloudflare Workers")).toBeVisible();
});

test("user can create and manage a link end to end", async ({ page }) => {
  const id = unique();
  const name = `Owner ${id}`;
  const email = `owner-${id}@example.com`;
  const password = "Password123!";
  const organizationName = `Snarvei Org ${id}`;
  const organizationSlug = `snarvei-org-${id}`;
  const teamName = "Growth";
  const initialTarget = `https://example.com/${id}`;
  const updatedTarget = `https://example.com/${id}/updated`;
  const linkTitle = `Campaign ${id}`;
  const updatedLinkTitle = `Campaign ${id} Updated`;

  await page.goto("/");

  await page.getByTestId("auth-name-input").fill(name);
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill(password);
  await clickTestIdButton(page, "create-account-button");

  await expect(page.getByText("Account created.")).toBeVisible();
  await expect(page.getByText("Organizations").first()).toBeVisible();

  await page.getByTestId("organization-name-input").fill(organizationName);
  await page.getByTestId("organization-slug-input").fill(organizationSlug);
  await clickTestIdButton(page, "create-organization-button");
  await expect(page.getByRole("button", { name: organizationName })).toBeVisible();
  await clickTestIdButton(page, "create-team-button");
  await expect(page.getByRole("button", { name: teamName })).toBeVisible();

  await page.getByTestId("create-link-target-input").fill(initialTarget);
  await page.getByTestId("create-link-title-input").fill(linkTitle);
  await page.getByTestId("create-link-description-input").fill("Created from Playwright coverage");
  await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes("/api/links") && response.request().method() === "POST" && response.ok(),
    ),
    clickTestIdButton(page, "create-link-button"),
  ]);
  await expect(page.getByText("Short link created.")).toBeVisible();
  await expect(page.getByText(linkTitle)).toBeVisible();
  await expect(page.getByText(initialTarget).first()).toBeVisible();

  await page.getByRole("button", { name: "Manage" }).first().click();
  await page.getByTestId("selected-link-target-input").fill(updatedTarget);
  await page.getByTestId("selected-link-title-input").fill(updatedLinkTitle);
  await page.getByTestId("selected-link-description-input").fill("Updated from Playwright coverage");
  await clickTestIdButton(page, "save-link-button");
  await expect(page.getByText(updatedLinkTitle)).toBeVisible();
  await expect(page.getByText(updatedTarget).first()).toBeVisible();

  const openLink = page.getByRole("link", { name: "Open" }).first();
  const hrefText = await openLink.getAttribute("href");
  const slug = hrefText?.split("/l/").at(-1)?.trim();
  expect(slug).toBeTruthy();

  const redirectResponse = await page.request.get(`/l/${slug}`, {
    maxRedirects: 0,
  });
  expect(redirectResponse.status()).toBe(302);
  expect(redirectResponse.headers()["location"]).toBe(updatedTarget);

  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByTestId("analytics-total-clicks")).toHaveText("1");
  await expect(page.getByTestId("analytics-unique-visitors")).toHaveText("1");
  await expect(page.getByText(updatedTarget).first()).toBeVisible();

  await clickTestIdButton(page, "delete-link-button");
  await expect(page.getByText(updatedLinkTitle)).not.toBeVisible();
  await expect(page.getByText("Create your first link to start collecting analytics.")).toBeVisible();
});
