import { expect, test } from "@playwright/test";

const SERVER_URL = process.env.E2E_SERVER_URL ?? "http://localhost:4199";

function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

test.describe("auth flow", () => {
  test("register, verify email, log in, view dashboard, and log out", async ({ page, request }) => {
    const email = uniqueEmail();
    const password = "a-strong-password";

    await page.goto("/register");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole("button", { name: /register/i }).click();
    await expect(page.getByText(/check your email to verify/i)).toBeVisible();

    const tokensRes = await request.get(`${SERVER_URL}/api/test/tokens`, { params: { email } });
    expect(tokensRes.ok()).toBeTruthy();
    const { verificationToken } = await tokensRes.json();
    expect(verificationToken).toBeTruthy();

    await page.goto(`/verify-email/${verificationToken}`);
    await expect(page.getByText(/you can now log in/i)).toBeVisible();

    await page.goto("/login");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole("button", { name: /log in/i }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(`Welcome, ${email}.`)).toBeVisible();

    await page.getByRole("button", { name: /log out/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("shows an error for an invalid login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("nobody@example.com");
    await page.getByLabel(/password/i).fill("wrong-password");
    await page.getByRole("button", { name: /log in/i }).click();
    await expect(page.getByRole("alert")).toHaveText(/invalid email or password/i);
  });

  test("supports the forgot-password / reset-password flow", async ({ page, request }) => {
    const email = uniqueEmail();
    const password = "original-password";
    const newPassword = "a-brand-new-password";

    await page.goto("/register");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole("button", { name: /register/i }).click();
    await expect(page.getByText(/check your email to verify/i)).toBeVisible();

    const { verificationToken } = await (
      await request.get(`${SERVER_URL}/api/test/tokens`, { params: { email } })
    ).json();
    await page.goto(`/verify-email/${verificationToken}`);
    await expect(page.getByText(/you can now log in/i)).toBeVisible();

    await page.goto("/forgot-password");
    await page.getByLabel(/email/i).fill(email);
    await page.getByRole("button", { name: /send reset link/i }).click();
    await expect(page.getByText(/if that email is registered/i)).toBeVisible();

    const { resetPasswordToken } = await (
      await request.get(`${SERVER_URL}/api/test/tokens`, { params: { email } })
    ).json();
    expect(resetPasswordToken).toBeTruthy();

    await page.goto(`/reset-password/${resetPasswordToken}`);
    await page.getByLabel(/new password/i).fill(newPassword);
    await page.getByRole("button", { name: /reset password/i }).click();
    await expect(page.getByText(/you can now log in/i)).toBeVisible();

    await page.getByRole("link", { name: /log in/i }).click();
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(newPassword);
    await page.getByRole("button", { name: /log in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
