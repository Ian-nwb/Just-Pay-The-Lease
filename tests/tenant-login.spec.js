const { test, expect } = require('@playwright/test');

test('tenant login route uses existing authentication and opens the resident portal', async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill({ json: { success: true, data: [] } }));
  await page.route('**/api/auth/login', (route) => route.fulfill({ json: {
    success: true,
    token: 'playwright-session-token',
    user: { id: 'tenant-test', role: 'tenant', firstName: 'Test', lastName: 'Resident', email: 'resident@example.test' },
  } }));
  await page.goto('/tenant-login');
  await expect(page.getByRole('heading', { name: 'Tenant sign in' })).toBeVisible();

  await page.fill('#login-email', 'resident@example.test');
  await page.fill('#login-password', 'SafeTestPassword123');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();

  await expect(page).toHaveURL(/\/tenant(?:\/|$)/, { timeout: 15000 });
});

test('tenant login still routes according to the authenticated account role', async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill({ json: { success: true, data: [] } }));
  await page.route('**/api/auth/login', (route) => route.fulfill({ json: {
    success: true,
    token: 'playwright-landlord-session-token',
    user: { id: 'landlord-test', role: 'landlord', firstName: 'Test', lastName: 'Landlord', email: 'landlord@example.test' },
  } }));
  await page.goto('/tenant-login');
  await page.fill('#login-email', 'landlord@example.test');
  await page.fill('#login-password', 'SafeTestPassword123');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\/|$)/, { timeout: 15000 });
});

test('landlord dashboard summarizes persisted portfolio data without fabricated trends', async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill({ json: { success: true, data: [] } }));
  await page.route('**/api/auth/login', (route) => route.fulfill({ json: {
    success: true,
    token: 'playwright-landlord-dashboard-token',
    user: { id: 'landlord-dashboard-test', role: 'landlord', firstName: 'Taylor', lastName: 'Owner', email: 'owner@example.test' },
  } }));
  await page.route('**/api/landlord/dash/init', (route) => route.fulfill({ json: {
    success: true,
    data: {
      properties: { ok: true, data: [{ _id: 'property-1', name: 'Test Homes', units: [
        { _id: 'unit-1', label: 'Unit 1', status: 'occupied', monthlyRent: 4500 },
        { _id: 'unit-2', label: 'Unit 2', status: 'vacant', monthlyRent: 5000 },
      ] }] },
      tickets: { ok: true, data: [{ id: 'ticket-1', status: 'new', title: 'Leaking tap', propertyName: 'Test Homes', unitLabel: 'Unit 1' }] },
      tenants: { ok: true, data: [] }, documents: { ok: true, data: [] }, rentroll: { ok: true, data: [] }, announcements: { ok: true, data: [] }, dash: { ok: true, data: {} },
    },
  } }));
  await page.goto('/login');
  await page.fill('#login-email', 'owner@example.test');
  await page.fill('#login-password', 'SafeTestPassword123');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\/|$)/, { timeout: 15000 });
  await expect(page.getByText('Scheduled monthly rent')).toBeVisible();
  await expect(page.getByText('₱4,500.00')).toBeVisible();
  await expect(page.getByText('50%')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Assign tenant', exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('Scheduled monthly rent')).toBeVisible();
  const viewportWidths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(viewportWidths.content).toBeLessThanOrEqual(viewportWidths.viewport + 1);
});
