import { test, expect } from '@playwright/test';
import { expectNoWcagViolations, gotoOk, suppressBootSplash } from './support/screen';

/**
 * Home (`/`) — the BRAND front door. The splash suppression that makes an axe
 * scan deterministic lives in `./support/screen` (with the full account of why);
 * it is shared with every other screen spec.
 */
test.beforeEach(async ({ page }) => {
  await suppressBootSplash(page);
});

test('shell renders (200), exposes the command deck, and has no WCAG A/AA violations', async ({
  page,
}) => {
  await gotoOk(page, '/');

  // Stable across screens: the Sentinel Fields shell (banner + command deck).
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Command deck' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Leaderboard' })).toBeVisible();

  // The splash is suppressed above, so it can never be mid-fade during the scan.
  await expect(page.getByRole('button', { name: /skip/i })).toHaveCount(0);

  await expectNoWcagViolations(page);
});
