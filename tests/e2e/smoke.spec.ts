import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('shell renders (200), exposes the command deck, and has no WCAG A/AA violations', async ({
  page,
}) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);

  // Stable across screens: the Sentinel Fields shell (banner + command deck).
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Command deck' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Leaderboard' })).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  expect(results.violations).toEqual([]);
});
