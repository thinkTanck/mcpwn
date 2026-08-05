import { test, expect, type Page } from '@playwright/test';
import { expectNoWcagViolations, gotoOk, suppressBootSplash } from './support/screen';

/**
 * EVERY SHIPPED SCREEN, rendered and scanned.
 *
 * Before this suite the e2e tier tested exactly one page (`/`) while the
 * Definition of Done claimed an end-to-end critical path. This covers the rest of
 * the shipped routes: each one must serve a real 200, render its OWN load-bearing
 * content (so a blank shell or an empty-state fallback cannot pass), and report
 * zero WCAG A/AA violations.
 *
 * The assertions deliberately bind to DURABLE, user-visible surface — headings,
 * landmarks, roles, accessible names — not to internal markup. Several of these
 * screens are actively being reworked; an e2e that breaks on a class name is a
 * tax, not a gate.
 */

type Screen = {
  /** Human name, used as the test title. */
  name: string;
  path: string;
  /** Is the route inside the (hud) shell (banner + command deck)? */
  shell: boolean;
  /** Assert the screen's own load-bearing content is really on the page. */
  content: (page: Page) => Promise<void>;
};

const SCREENS: Screen[] = [
  {
    name: 'Connect / Run Setup',
    path: '/connect',
    shell: true,
    content: async (page) => {
      await expect(
        page.getByRole('heading', { level: 1, name: 'Set up a red-team run.' }),
      ).toBeVisible();
      // The three real choices on the console: mode, categories, and the launch.
      await expect(page.getByRole('group', { name: 'Run mode' })).toBeVisible();
      await expect(page.getByRole('group', { name: /^Attack categories/ })).toBeVisible();
      await expect(page.getByRole('link', { name: /play sample run/i })).toBeVisible();
    },
  },
  {
    name: 'Sign-in',
    path: '/sign-in',
    // Standalone route, OUTSIDE the (hud) shell on purpose: a signed-out gate
    // must not render the authenticated command deck.
    shell: false,
    content: async (page) => {
      await expect(
        page.getByRole('heading', { level: 1, name: 'Continue to MCPwn.' }),
      ).toBeVisible();
      await expect(page.getByLabel('Email')).toBeVisible();
      await expect(page.getByRole('button', { name: /email me a code/i })).toBeVisible();
      // Code-only by design: the sign-in flow never promises a clickable link.
      await expect(page.getByText(/magic link/i)).toHaveCount(0);
      // The signed-out shell must not be here.
      await expect(page.getByRole('navigation', { name: 'Command deck' })).toHaveCount(0);
    },
  },
  {
    name: 'Live Attack Replay (hero)',
    path: '/runs/sample',
    shell: true,
    content: async (page) => {
      // The sample run is ASI06 Memory & Context Poisoning; assert the heading
      // binds from the run rather than pinning the whole string.
      await expect(page.getByRole('heading', { level: 1 })).toContainText('ASI06');
      // Transport, verdict rail and step detail are what make it a replay.
      await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
      await expect(page.getByRole('slider', { name: 'Scrub to step' })).toBeVisible();
      await expect(page.getByRole('complementary', { name: 'Detector verdict' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Step detail' })).toBeVisible();
      // The fix-report off-ramp the verdict offers.
      await expect(page.getByRole('link', { name: 'Export fix report' })).toBeVisible();
    },
  },
  {
    name: 'Findings / fix report',
    path: '/findings/sample',
    shell: true,
    content: async (page) => {
      await expect(page.getByRole('article', { name: 'Fix report' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      // The engineer-facing sections are the point of the screen. Asserted as
      // headings (the document outline), which survive a markup rework.
      for (const section of ['Offending step', 'Summary', 'Detector rationale', 'Remediation']) {
        await expect(page.getByRole('heading', { name: section })).toBeVisible();
      }
      await expect(page.getByRole('button', { name: 'Copy report' })).toBeVisible();
    },
  },
  {
    // The ASI10 sample, whose class classified 0 of 4. The withheld state is a
    // real shipped state of this screen, so it is rendered and scanned like any
    // other; the id is the kind-free sample run id.
    name: 'Findings / fix report (classification unreliable)',
    path: '/findings/asi10-goal-drift',
    shell: true,
    content: async (page) => {
      await expect(page.getByRole('article', { name: 'Fix report' })).toBeVisible();
      // What IS reliable still renders: the compromise and its anchored step.
      await expect(page.getByText('COMPROMISED').first()).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Offending step' })).toBeVisible();
      // What is not is withheld, in words, with no remediation list to work.
      await expect(page.getByText('CLASSIFICATION UNRELIABLE')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Remediation withheld' })).toBeVisible();
      await expect(page.getByRole('list', { name: 'Remediation' })).toHaveCount(0);
    },
  },
  {
    name: 'Robustness Leaderboard',
    path: '/leaderboard',
    shell: true,
    content: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Model');
      const heatmap = page.getByRole('region', {
        name: 'Model by category robustness heatmap',
      });
      await expect(heatmap).toBeVisible();
      // Every cell drills into a run, so at least one such link must exist INSIDE
      // the heatmap: a heatmap that opens nothing is a picture, not the product.
      // Scoped to the region on purpose, or the command deck's own Live Replay
      // link (present but off-screen in the mobile drawer) would satisfy it.
      await expect(heatmap.locator('a[href^="/runs/"]').first()).toBeVisible();
    },
  },
  {
    name: 'Threat Model / Coverage',
    path: '/threats',
    shell: true,
    content: async (page) => {
      await expect(page.getByRole('heading', { level: 1 })).toContainText('What we test');
      // All ten OWASP Agentic categories are on the board: the Core-7 covered and
      // ASI07/08/09 stated as not measurable. Missing rows would be the exact
      // dishonesty this screen exists to prevent.
      for (const n of ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10']) {
        await expect(page.getByTestId(`threat-ASI${n}`)).toBeVisible();
      }
    },
  },
];

test.beforeEach(async ({ page }) => {
  await suppressBootSplash(page);
});

for (const screen of SCREENS) {
  test(`${screen.name} (${screen.path}) renders its content and has no WCAG A/AA violations`, async ({
    page,
  }) => {
    await gotoOk(page, screen.path);

    if (screen.shell) {
      await expect(page.getByRole('banner')).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Command deck' })).toBeVisible();
    }

    await screen.content(page);

    // The splash is suppressed in beforeEach, so it can never be mid-fade here.
    await expect(page.getByRole('button', { name: /skip/i })).toHaveCount(0);

    await expectNoWcagViolations(page);
  });
}
