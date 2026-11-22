const { test, expect } = require('@playwright/test');

async function signIn(page, email) {
  await page.goto('/login');
  await page.fill('#login-email', email);
  await page.fill('#login-password', 'Password123!');
  await page.locator('button[type="submit"]').click();
}

test.describe('Phase 3-4 resident and property workflows', () => {
  test('tenant can submit a partial amount and open inventory and messaging', async ({ page }) => {
    await signIn(page, 'sophia@jptl.dev');
    await expect(page).toHaveURL(/tenant/i, { timeout: 15000 });
    await page.getByRole('button', { name: /Rent & Payments/i }).click();
    await page.getByRole('button', { name: /Pay Rent Now/i }).click();
    const paymentDialog = page.getByRole('dialog', { name: /Submit rent payment/i });
    await expect(paymentDialog.getByLabel(/Amount to submit/i)).toBeVisible();
    await expect(paymentDialog.getByText(/Outstanding/i)).toBeVisible();
    await paymentDialog.getByRole('button', { name: /Close/i }).click();
    await page.getByRole('button', { name: /Unit Inventory/i }).click();
    await expect(page.getByRole('heading', { name: /Unit inventory/i })).toBeVisible();
    await page.getByRole('button', { name: /Messages/i }).click();
    await expect(page.getByRole('heading', { name: /Messages/i })).toBeVisible();
  });

  test('landlord can open inventory and payment balance workflows', async ({ page }) => {
    await signIn(page, 'landlord@jptl.dev');
    await expect(page).toHaveURL(/dashboard/i, { timeout: 15000 });
    await page.getByRole('button', { name: /Unit Inventory/i }).click();
    await expect(page.getByRole('heading', { name: /Unit inventory/i })).toBeVisible();
    await page.getByRole('button', { name: /Messages/i }).click();
    await expect(page.getByRole('heading', { name: /Messages/i })).toBeVisible();
  });
});
