import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * RESTING contrast of the boot splash, at FULL opacity.
 *
 * This exists because the e2e axe scan can no longer cover it. The splash is a
 * self-dismissing 2.5s overlay kicked by `requestIdleCallback` and faded in over
 * 320ms, so a live scan measures whatever opacity it happens to catch: it
 * reported values as low as 1.07:1 for a control whose resting contrast is
 * 5.2:1 and passes, and it flipped verdict run to run. `tests/e2e/smoke.spec.ts`
 * now suppresses the splash to make that gate deterministic, which removed the
 * only contrast coverage the splash had.
 *
 * So contrast is asserted statically instead: resolve the tokens the splash
 * actually uses and check them against the surface it actually renders on. That
 * is the honest thing to measure anyway - a mid-animation frame is not a state a
 * user reads text in, and no user ever sees the transient value.
 *
 * The role list is DERIVED FROM THE COMPONENT SOURCE, not hardcoded, so a new
 * text colour added to the splash is caught rather than silently uncovered.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const css = read('src/app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '');
const splash = read('src/components/splash/BootSplash.tsx');

type RGB = [number, number, number];

/**
 * Both declaration blocks matter. The DTCG primitives and semantic aliases live
 * in `:root`; the Tailwind utility colours (`--color-*`, what `text-ink-faint`
 * compiles to) live in the v4 `@theme inline` block. Reading only `:root` would
 * leave every utility unresolvable.
 */
function parseVars(source: string): Map<string, string> {
  const vars = new Map<string, string>();
  const blocks = [
    source.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1],
    source.match(/@theme[^{]*\{([\s\S]*?)\n\}/)?.[1],
  ];
  if (!blocks[0]) throw new Error(':root block not found in globals.css');
  if (!blocks[1]) throw new Error('@theme block not found in globals.css');
  for (const body of blocks) {
    for (const decl of (body ?? '').split(';')) {
      const m = decl.match(/^\s*(--[\w-]+)\s*:\s*(.+?)\s*$/s);
      if (m?.[1] && m[2]) vars.set(m[1], m[2].trim());
    }
  }
  return vars;
}

const vars = parseVars(css);

const hexToRgb = (hex: string): RGB => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
};

/** Resolve a token chain (`var(--a)` -> ... -> `#hex`) to RGB. */
function resolve(value: string, seen = new Set<string>()): RGB {
  const v = value.trim();
  const ref = v.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (ref?.[1]) {
    const name = ref[1];
    if (seen.has(name)) throw new Error(`token cycle at ${name}`);
    seen.add(name);
    const next = vars.get(name);
    if (!next) throw new Error(`undefined token ${name}`);
    return resolve(next, seen);
  }
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v)) return hexToRgb(v);
  throw new Error(`cannot resolve colour: ${value}`);
}

const luminance = ([r, g, b]: RGB): number => {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

const contrast = (a: RGB, b: RGB): number => {
  const [l1, l2] = [luminance(a), luminance(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

/** Tailwind text utilities -> the DTCG token each resolves to. */
const TEXT_ROLE_TOKENS: Record<string, string> = {
  'text-ink-faint': '--color-ink-faint',
  'text-ink-muted': '--color-ink-muted',
  'text-ink': '--color-ink',
  'text-readout': '--color-readout',
  'text-nominal': '--color-nominal',
};

/** `.micro-label` is a role class, not a utility; it paints instrument-faint. */
const ROLE_CLASS_TOKENS: Record<string, string> = {
  'micro-label': '--instrument-color-faint',
};

/** Text colours the splash actually uses, read off its source. */
function splashTextRoles(): string[] {
  const found = new Set<string>();
  for (const cls of Object.keys(TEXT_ROLE_TOKENS)) {
    // Word-boundary match so `text-ink` does not swallow `text-ink-faint`.
    if (new RegExp(`(^|[\\s"'\`])${cls}([\\s"'\`]|$)`).test(splash)) found.add(cls);
  }
  for (const cls of Object.keys(ROLE_CLASS_TOKENS)) {
    if (splash.includes(cls)) found.add(cls);
  }
  return [...found];
}

// The splash root is `bg-base`, so every text role sits on the base surface.
const background = resolve('var(--surface-base)');

describe('boot splash — resting contrast at full opacity', () => {
  const roles = splashTextRoles();

  it('finds the text roles in the component source', () => {
    // A tripwire on the extraction: if the regex stopped matching, every
    // assertion below would pass vacuously over an empty list.
    expect(roles.length).toBeGreaterThanOrEqual(3);
    expect(roles).toContain('text-ink-faint'); // the SKIP control
  });

  it.each(splashTextRoles())('%s meets WCAG AA (4.5:1) on the splash surface', (role) => {
    const token = TEXT_ROLE_TOKENS[role] ?? ROLE_CLASS_TOKENS[role];
    if (!token) throw new Error(`no token mapping for ${role}`);
    const fg = resolve(`var(${token})`);
    const ratio = contrast(fg, background);
    expect(
      ratio,
      `${role} (${token}) is ${ratio.toFixed(2)}:1 on --surface-base; the splash text is ` +
        `12-15px, so WCAG AA needs 4.5:1`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * The SKIP control is the one a keyboard user must be able to find, and it is
   * the element the flaky e2e scan kept reporting. Pinned explicitly so it
   * cannot lose coverage if the extraction above is ever narrowed.
   */
  it('keeps the SKIP control readable', () => {
    expect(splash).toMatch(/text-ink-faint/);
    const ratio = contrast(resolve('var(--color-ink-faint)'), background);
    expect(ratio, `SKIP is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });
});
