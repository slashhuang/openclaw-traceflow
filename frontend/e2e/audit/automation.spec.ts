import { test, expect } from '@playwright/test';

// Test: /audit/automation page loads and shows automation type

test('should load /audit/automation and display automation type', async ({ page }) => {
  // Mock API response
  await page.route('/api/audit/automation?limit=20', async (route) => {
    const json = {
      success: true,
      events: [
        {
          type: 'automation',
          timestamp: '2026-04-01T09:30:00Z',
          automationType: 'daily-ai-news',
          tokenUsage: { input: 120000, output: 10000 },
          sessionId: 'main/zzz',
        },
      ],
      total: 1,
    };
    await route.fulfill({ json });
  });

  await page.goto('/audit/automation');

  // Check page title
  await expect(page).toHaveTitle(/自动化运行明细/);

  // Check table renders
  await expect(page.locator('text=⚡ 自动化运行明细')).toBeVisible();
  await expect(page.locator('table')).toBeVisible();
  await expect(page.locator('text=daily-ai-news')).toBeVisible();
});