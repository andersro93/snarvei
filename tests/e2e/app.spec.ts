import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const unique = () => crypto.randomUUID().slice(0, 8);

/**
 * Every test gets its own client IP. Auth and redirect endpoints are rate
 * limited per IP (Better Auth + the RATE_LIMIT binding); without this, the
 * whole suite shares 127.0.0.1 and repeated sign-ups trip the limits.
 * Locally the Worker trusts cf-connecting-ip; on Cloudflare the edge sets it.
 */
const uniqueClientIp = () =>
  `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`;

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "cf-connecting-ip": uniqueClientIp() });
});

const clickTestIdButton = async (page: Page, testId: string) => {
  const button = page.getByTestId(testId);
  await expect(button).toBeEnabled();
  await button.click();
};

test("landing page renders product messaging", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Short links you can trust long after they are shared.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
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

  await expect(page.getByText("Choose your organization")).toBeVisible();
  await page.getByRole("button", { name: "Create organization" }).click();

  await page.getByTestId("organization-name-input").fill(organizationName);
  await page.getByTestId("organization-slug-input").fill(organizationSlug);
  await clickTestIdButton(page, "create-organization-button");
  await expect(page.getByText("Dashboard coming next")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/app/${organizationSlug}/dashboard$`));

  await page.getByRole("link", { name: "Organization" }).click();
  await clickTestIdButton(page, "open-create-team-button");
  await page.getByTestId("team-name-input").fill(teamName);
  await clickTestIdButton(page, "create-team-button");
  await expect(page.getByTestId(`manage-team-${teamName}`)).toBeVisible();
  await expect(page.getByText(`Manage members, invitations, and teams for ${organizationName}.`)).toBeVisible();

  await page.getByRole("link", { name: "Links" }).click();
  await expect(page).toHaveURL(new RegExp(`/app/${organizationSlug}/links$`));
  await page.getByRole("button", { name: "Create link" }).click();
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
  await expect(page).toHaveURL(new RegExp(`/app/${organizationSlug}/links/[a-z0-9-]+$`));
  await expect(page.getByText(initialTarget).first()).toBeVisible();

  await page.getByRole("button", { name: "Edit link" }).click();
  await page.getByTestId("selected-link-target-input").fill(updatedTarget);
  await page.getByTestId("selected-link-title-input").fill(updatedLinkTitle);
  await page.getByTestId("selected-link-description-input").fill("Updated from Playwright coverage");
  await clickTestIdButton(page, "save-link-button");
  await expect(page.getByText(updatedLinkTitle)).toBeVisible();
  await expect(page.getByText(updatedTarget).first()).toBeVisible();
  const detailUrl = page.url();

  const openLink = page.getByRole("link", { name: "Open" });
  const hrefText = await openLink.getAttribute("href");
  const hrefParts = hrefText?.split("/l/");
  const slug = hrefParts ? hrefParts[hrefParts.length - 1]?.trim() : undefined;
  expect(slug).toBeTruthy();

  const redirectResponse = await page.request.get(`/l/${slug}`, {
    maxRedirects: 0,
  });
  expect(redirectResponse.status()).toBe(302);
  expect(redirectResponse.headers()["location"]).toBe(updatedTarget);

  // The click event is recorded asynchronously (waitUntil); wait for it via the API
  // before asserting on the UI so the test does not race the insert.
  const linkId = detailUrl.split("/links/")[1];
  await expect
    .poll(async () => ((await (await page.request.get(`/api/links/${linkId}/analytics`)).json()) as { totalClicks: number }).totalClicks)
    .toBe(1);
  await page.goto(detailUrl);
  await expect(page.getByTestId("analytics-total-clicks")).toHaveText("1");
  await expect(page.getByTestId("analytics-unique-visitors")).toHaveText("1");
  await expect(page.getByText(updatedTarget).first()).toBeVisible();

  await page.getByRole("button", { name: "Edit link" }).click();
  await clickTestIdButton(page, "delete-link-button");
  await expect(page).toHaveURL(new RegExp(`/app/${organizationSlug}/links$`));
  await expect(page.getByText(updatedLinkTitle)).toHaveCount(0);
  const afterDelete = await page.request.get(`/l/${slug}`, { maxRedirects: 0 });
  expect(afterDelete.status()).toBe(404);
  const apiAfterDelete = await page.request.get(`/api/links/${linkId}`);
  expect(apiAfterDelete.status()).toBe(404);
});

test("existing user can sign in with email and password", async ({ page }) => {
  const id = unique();
  const email = `returning-${id}@example.com`;
  const password = "Password123!";

  const signUpResponse = await page.request.post("/api/auth/sign-up/email", {
    data: { name: `Returning ${id}`, email, password },
    headers: { origin: "http://127.0.0.1:4173", "cf-connecting-ip": uniqueClientIp() },
  });
  expect(signUpResponse.ok()).toBeTruthy();
  await page.context().clearCookies();

  await page.goto("/");
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL(/\/app\/select-organization$/);
  await expect(page.getByText("Choose your organization")).toBeVisible();
});

test("wrong password is rejected", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("auth-email-input").fill(`nobody-${unique()}@example.com`);
  await page.getByTestId("auth-password-input").fill("definitely-wrong");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).not.toHaveURL(/select-organization/);
  await expect(page.getByRole("alert")).toBeVisible();
});

test("user can open settings and update their profile name", async ({ page }) => {
  const id = unique();
  const name = `Owner ${id}`;
  const updatedName = `Owner ${id} Updated`;
  const email = `owner-settings-${id}@example.com`;
  const password = "Password123!";
  const organizationName = `Settings Org ${id}`;
  const organizationSlug = `settings-org-${id}`;

  await page.goto("/");

  await page.getByTestId("auth-name-input").fill(name);
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill(password);
  await clickTestIdButton(page, "create-account-button");

  await expect(page.getByText("Choose your organization")).toBeVisible();
  await page.getByRole("button", { name: "Create organization" }).click();
  await page.getByTestId("organization-name-input").fill(organizationName);
  await page.getByTestId("organization-slug-input").fill(organizationSlug);
  await clickTestIdButton(page, "create-organization-button");

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/app\/settings$/);
  await expect(page.getByRole("heading", { name: "Your settings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Active sessions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Passkeys" })).toBeVisible();

  await page.getByTestId("settings-name-input").fill(updatedName);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile updated.")).toBeVisible();
  await expect(page.getByText(updatedName).first()).toBeVisible();
});

test("invited member accepts the invitation and only sees their team's links", async ({ browser, page }) => {
  const id = unique();
  const password = "Password123!";
  const ownerEmail = `owner-inv-${id}@example.com`;
  const inviteeEmail = `invitee-${id}@example.com`;
  const organizationName = `Invite Org ${id}`;
  const organizationSlug = `invite-org-${id}`;

  // Owner: sign up, create organization + two teams, one link per team.
  await page.goto("/");
  await page.getByTestId("auth-name-input").fill(`Owner ${id}`);
  await page.getByTestId("auth-email-input").fill(ownerEmail);
  await page.getByTestId("auth-password-input").fill(password);
  await clickTestIdButton(page, "create-account-button");
  await expect(page.getByText("Choose your organization")).toBeVisible();
  await page.getByRole("button", { name: "Create organization" }).click();
  await page.getByTestId("organization-name-input").fill(organizationName);
  await page.getByTestId("organization-slug-input").fill(organizationSlug);
  await clickTestIdButton(page, "create-organization-button");
  await expect(page).toHaveURL(new RegExp(`/app/${organizationSlug}/dashboard$`));

  await page.getByRole("link", { name: "Organization" }).click();
  for (const teamName of ["Growth", "Ops"]) {
    await clickTestIdButton(page, "open-create-team-button");
    await page.getByTestId("team-name-input").fill(teamName);
    await clickTestIdButton(page, "create-team-button");
    await expect(page.getByTestId(`manage-team-${teamName}`)).toBeVisible();
    await expect(page.getByTestId("team-name-input")).toHaveCount(0);
  }

  // Invite the member into the Growth team via the UI.
  await clickTestIdButton(page, "open-invite-member-button");
  await page.getByTestId("invite-email-input").fill(inviteeEmail);
  await page.getByRole("combobox", { name: "Team (optional)" }).click();
  await page.getByRole("option", { name: "Growth" }).click();
  await clickTestIdButton(page, "send-invitation-button");
  await expect(page.getByText(`Invitation sent to ${inviteeEmail}.`)).toBeVisible();
  await expect(page.getByTestId(`invitation-${inviteeEmail}`)).toContainText("team Growth");

  // Create one link per team and read the invitation id through the API as the owner
  // (same session cookie) to keep the UI steps focused on the invitation flow.
  const invitationId = await page.evaluate(async () => {
    const me = (await (await fetch("/api/me", { credentials: "include" })).json()) as { session: { activeOrganizationId: string } };
    const organizationId = me.session.activeOrganizationId;
    const response = await fetch(`/api/auth/organization/list-invitations?organizationId=${organizationId}`, { credentials: "include" });
    const invitations = (await response.json()) as Array<{ id: string; status: string }>;
    return invitations.find((invitation) => invitation.status === "pending")?.id ?? "";
  });
  expect(invitationId).toBeTruthy();
  const { growthLink, opsLink } = await page.evaluate(async () => {
    const me = (await (await fetch("/api/me", { credentials: "include" })).json()) as { session: { activeOrganizationId: string } };
    const organizationId = me.session.activeOrganizationId;
    const teams = (await (await fetch(`/api/auth/organization/list-teams?organizationId=${organizationId}`, { credentials: "include" })).json()) as Array<{ id: string; name: string }>;
    const create = async (teamId: string, title: string) =>
      (await (
        await fetch("/api/links", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ teamId, targetUrl: `https://example.com/${title}`, title }),
        })
      ).json()) as { id: string; title: string };
    const growth = teams.find((team) => team.name === "Growth")!;
    const ops = teams.find((team) => team.name === "Ops")!;
    return { growthLink: await create(growth.id, "Growth link"), opsLink: await create(ops.id, "Ops link") };
  });
  expect(growthLink.id).toBeTruthy();
  expect(opsLink.id).toBeTruthy();

  // Invitee: open the invitation link signed out -> lands on the landing page with ?next=, signs up, comes back, accepts.
  const inviteeContext = await browser.newContext({ extraHTTPHeaders: { "cf-connecting-ip": uniqueClientIp() } });
  const inviteePage = await inviteeContext.newPage();
  await inviteePage.goto(`/app/invitations/${invitationId}`);
  await expect(inviteePage).toHaveURL(/\/\?next=%2Fapp%2Finvitations%2F/);
  await inviteePage.getByTestId("auth-name-input").fill(`Invitee ${id}`);
  await inviteePage.getByTestId("auth-email-input").fill(inviteeEmail);
  await inviteePage.getByTestId("auth-password-input").fill(password);
  await clickTestIdButton(inviteePage, "create-account-button");

  await expect(inviteePage).toHaveURL(new RegExp(`/app/invitations/${invitationId}$`));
  await expect(inviteePage.getByTestId("invitation-organization")).toHaveText(organizationName);
  await clickTestIdButton(inviteePage, "invitation-accept-button");
  await expect(inviteePage).toHaveURL(new RegExp(`/app/${organizationSlug}/dashboard$`));

  // The member sees only the Growth team's link.
  await inviteePage.getByRole("link", { name: "Links" }).click();
  await expect(inviteePage.getByText("Growth link").first()).toBeVisible();
  await expect(inviteePage.getByText("Ops link")).toHaveCount(0);
  const forbidden = await inviteePage.request.get(`/api/links/${opsLink.id}`);
  expect(forbidden.status()).toBe(403);

  // Owner adds the member to Ops through the team dialog; the member now sees both links.
  await page.getByTestId("manage-team-Ops").click();
  await page.getByRole("combobox", { name: "Add organization member" }).click();
  await page.getByTestId(`add-team-member-option-${inviteeEmail}`).click();
  await clickTestIdButton(page, "add-team-member-button");
  await expect(page.getByTestId("team-members-list")).toContainText(inviteeEmail);

  await inviteePage.reload();
  await expect(inviteePage.getByText("Ops link").first()).toBeVisible();
  const allowed = await inviteePage.request.get(`/api/links/${opsLink.id}`);
  expect(allowed.status()).toBe(200);

  await inviteeContext.close();
});
