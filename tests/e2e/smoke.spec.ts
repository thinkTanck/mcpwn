import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** The flag `BootSplash` reads to decide it has already been shown this session. */
const SPLASH_SEEN_KEY = 'mcpwn.boot.v1.seen';

/**
 * DETERMINISM, the hard-won kind.
 *
 * axe reads COMPUTED colour. The boot splash is a transient overlay kicked by
 * `requestIdleCallback` (1600ms timeout) and faded in over 320ms, so both
 * WHETHER it is on screen when the scan runs and HOW FAR THROUGH its fade it is
 * depend on how busy the main thread happens to be. Scanning mid-fade measures
 * half-transparent text and reports contrast no user ever sees: observed as low
 * as 1.07:1 for a control whose RESTING contrast is 5.2:1 and passes.
 *
 * That made this gate a coin flip. It passed on CI and failed locally on the
 * same commit, and it flipped verdict when an unrelated performance fix freed
 * the main thread and moved the idle callback earlier. Waiting for the splash to
 * detach is NOT enough either: when the splash has not appeared yet, that wait
 * resolves instantly and the scan races it on the way in. Measured 2 of 4 runs
 * failing that way.
 *
 * So the splash is suppressed outright, via the same session flag the component
 * itself honours. Home is then scanned in a settled state, every time.
 *
 * KNOWN GAP, stated rather than papered over: this gate therefore does NOT cover
 * the splash's own accessibility. Its roles and labels are covered by
 * `tests/unit/components/splash/boot-splash.test.tsx`, but its CONTRAST is not
 * covered anywhere, because a 2.5s self-dismissing overlay cannot be scanned
 * deterministically without pausing it. Worth closing with a dedicated
 * reduced-motion scan; not closed here.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ([key]) => window.sessionStorage.setItem(key as string, '1'),
    [SPLASH_SEEN_KEY],
  );
});

test('shell renders (200), exposes the command deck, and has no WCAG A/AA violations', async ({
  page,
}) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);

  // Stable across screens: the Sentinel Fields shell (banner + command deck).
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Command deck' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Leaderboard' })).toBeVisible();

  // The splash is suppressed above, so it can never be mid-fade during the scan.
  await expect(page.getByRole('button', { name: /skip/i })).toHaveCount(0);

  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();

  expect(results.violations).toEqual([]);
});
