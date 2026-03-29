/**
 * Shipped auth UI — login/signup work without a follow-up GET /api/auth/me after POST
 * (regression: fetchMe used to clear user when /me failed in dev).
 * Run: npm run test:e2e:reliability (same config as podsignal-reliability).
 */

import { test, expect } from '@playwright/test';

const NEW_USER_BODY = {
  userId: 'e2e-new',
  email: 'new@e2e.local',
  fullName: 'E2E New',
  merchantId: null,
  merchant: null,
};

test.describe('Shipped auth (mocked API)', () => {
  test('login page shows email signup entry point', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /sign up with email/i })).toBeVisible();
    await expect(page.getByText('Continue with Google')).toHaveCount(0);
  });

  test('signup page does not show Google SSO placeholder', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByText('Continue with Google')).toHaveCount(0);
  });

  test('sign-in succeeds when POST works and GET /api/auth/me always fails', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => {
      void route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Not authenticated' }),
      });
    });
    let loginPosts = 0;
    await page.route('**/api/auth/login', (route) => {
      loginPosts += 1;
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(NEW_USER_BODY),
      });
    });

    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill('new@e2e.local');
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await page.getByRole('button', { name: /^sign in$/i }).click();

    await expect.poll(() => loginPosts).toBe(1);
    await expect(page).toHaveURL(/\/onboarding/);
  });

  test('sign-in does not double-submit when button clicked twice', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => {
      void route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Not authenticated' }),
      });
    });
    let loginPosts = 0;
    await page.route('**/api/auth/login', async (route) => {
      loginPosts += 1;
      await new Promise((r) => setTimeout(r, 400));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(NEW_USER_BODY),
      });
    });

    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill('new@e2e.local');
    await page.getByLabel('Password', { exact: true }).fill('password123');
    const btn = page.getByRole('button', { name: /^sign in$/i });
    await btn.click();
    await btn.click();
    await expect.poll(() => loginPosts, { timeout: 5_000 }).toBe(1);
  });

  test('failed login shows server error message', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => {
      void route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Not authenticated' }),
      });
    });
    await page.route('**/api/auth/login', (route) => {
      void route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Invalid email or password' }),
      });
    });

    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill('bad@e2e.local');
    await page.getByLabel('Password', { exact: true }).fill('wrongpass12');
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page.getByText('Invalid email or password')).toBeVisible();
  });

  test('signup page submits and lands on onboarding (mocked)', async ({ page }) => {
    await page.route('**/api/auth/me', (route) => {
      void route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Not authenticated' }),
      });
    });
    await page.route('**/api/auth/signup', (route) => {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(NEW_USER_BODY),
      });
    });

    await page.goto('/signup');
    await page.getByLabel('Full name', { exact: true }).fill('E2E New');
    await page.getByLabel('Work email', { exact: true }).fill('new@e2e.local');
    await page.getByPlaceholder('Create a password (8+ characters)').fill('password123');
    await page.getByRole('button', { name: /start free trial/i }).click();
    await expect(page).toHaveURL(/\/onboarding/);
  });
});
