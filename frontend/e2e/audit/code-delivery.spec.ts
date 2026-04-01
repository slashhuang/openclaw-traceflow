import { test, expect } from '@playwright/test';

// Test: /audit/code page loads and shows MR table

test('should load /audit/code and display MR list', async ({ page }) => {
  // Mock API response
  await page.route('/api/audit/code?limit=20', async (route) => {
    const json = {
      success: true,
      events: [
        {
          type: 'code_delivery',
          timestamp: '2026-04-01T10:00:00Z',
          mr: { iid: 95, title: 'feat(audit): 支持 MR title 提取', project: 'claw-sources' },
          senderId: 'xiaogang.h',
          tokenUsage: { input: 75000, output: 7000 },
          sessionId: 'main/xxx',
        },
      ],
      total: 1,
    };
    await route.fulfill({ json });
  });

  await page.goto('/audit/code');

  // Check page title
  await expect(page).toHaveTitle(/代码交付明细/);

  // Check table renders
  await expect(page.locator('text=📦 代码交付明细')).toBeVisible();
  await expect(page.locator('table')).toBeVisible();
  await expect(page.locator('text=MR #95')).toBeVisible();
});