import { test, expect } from '@playwright/test';

// Test: /audit/qa page loads and shows question summary

test('should load /audit/qa and display question summary', async ({ page }) => {
  // Mock API response
  await page.route('/api/audit/qa?limit=20', async (route) => {
    const json = {
      success: true,
      events: [
        {
          type: 'qa',
          timestamp: '2026-04-01T10:00:00Z',
          senderId: 'xiaogang.h',
          tags: ['code/mr-create'],
          questionSummary: '帮我创建个 PR，修复 audit 目录路径…',
          tokenUsage: { input: 80000, output: 2000 },
          sessionId: 'main/xxx',
        },
      ],
      total: 1,
    };
    await route.fulfill({ json });
  });

  await page.goto('/audit/qa');

  // Check page title
  await expect(page).toHaveTitle(/问答服务明细/);

  // Check table renders
  await expect(page.locator('text=💬 问答服务明细')).toBeVisible();
  await expect(page.locator('table')).toBeVisible();
  await expect(page.locator('text=帮我创建个 PR，修复 audit 目录路径…')).toBeVisible();
});