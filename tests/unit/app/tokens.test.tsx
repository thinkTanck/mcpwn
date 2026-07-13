import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '@/app/error';

/**
 * Locks the DTCG two-tier token layer shipped in this increment
 * (src/app/globals.css). These are regression guards for design work that is
 * already done, not RED-first specs:
 *   - every `var(--token)` reference resolves to a defined custom property
 *     (no dangling tokens — incl. the back-compat aliases error.tsx consumes:
 *     --panel / --border / --danger);
 *   - the AA-corrected text tiers actually clear WCAG 2.2 AA on their surfaces;
 *   - the 8-pt --sp-* scale and the global :focus-visible ring exist.
 *
 * The CSS is read as a fixture and resolved by a small local var()/color-mix
 * evaluator, because jsdom does not apply stylesheets or compute custom
 * properties — so a runtime getComputedStyle check would be vacuous here.
 */

// Vitest runs with cwd at the project root (see vitest.config.ts).
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

const css = read('src/app/globals.css');
// Strip block comments (they carry token values in trailing notes) before parse.
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

// --- token table ----------------------------------------------------------

/** Parse `--name: value;` declarations from the :root block. */
function parseRootVars(source: string): Map<string, string> {
  const block = source.match(/:root\s*\{([\s\S]*?)\}/);
  if (!block) throw new Error(':root block not found in globals.css');
  const vars = new Map<string, string>();
  for (const decl of block[1].split(';')) {
    const m = decl.match(/^\s*(--[\w-]+)\s*:\s*(.+?)\s*$/s);
    if (m) vars.set(m[1], m[2].trim());
  }
  return vars;
}

const vars = parseRootVars(cssNoComments);

/** Every `var(--x)` reference anywhere in a source string. */
const tokenRefs = (source: string): string[] => [
  ...new Set([...source.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1])),
];

// --- color resolution + WCAG ----------------------------------------------

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.replace(/(.)/g, '$1$1') : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/**
 * Resolve a CSS color value to an RGB triple, following var() chains and
 * compositing `color-mix(in srgb, X P%, transparent)` over `base` (the surface
 * a translucent panel is painted on).
 */
function resolveColor(value: string, base: RGB): RGB {
  const v = value.trim();

  const varRef = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/s);
  if (varRef) {
    const name = varRef[1];
    if (vars.has(name)) return resolveColor(vars.get(name)!, base);
    if (varRef[2]) return resolveColor(varRef[2], base);
    throw new Error(`undefined token referenced: ${name}`);
  }

  const mix = v.match(/^color-mix\(\s*in srgb\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*transparent\s*\)$/s);
  if (mix) {
    const fg = resolveColor(mix[1], base);
    const p = parseFloat(mix[2]) / 100;
    return [
      fg[0] * p + base[0] * (1 - p),
      fg[1] * p + base[1] * (1 - p),
      fg[2] * p + base[2] * (1 - p),
    ];
  }

  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v)) return hexToRgb(v);
  throw new Error(`cannot resolve color value: ${value}`);
}

function relativeLuminance([r, g, b]: RGB): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: RGB, b: RGB): number {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const surfaceBase = resolveColor('var(--surface-base)', [0, 0, 0]);
// Panel is translucent; its rendered background is composited over the base.
const surfacePanel = resolveColor('var(--surface-panel)', surfaceBase);

// --- specs ----------------------------------------------------------------

describe('DTCG token layer (globals.css)', () => {
  it('defines every custom property referenced in globals.css (no undefined tokens)', () => {
    const missing = tokenRefs(cssNoComments).filter((name) => !vars.has(name));
    expect(missing).toEqual([]);
  });

  it('defines and resolves the back-compat aliases error.tsx depends on', () => {
    // The audit's "error.tsx token fix": these aliases must exist and bottom
    // out in a real color, incl. the previously-undefined --panel/--border/--danger.
    for (const name of ['--panel', '--border', '--danger', '--accent', '--bg', '--fg', '--muted']) {
      expect(vars.has(name), `${name} defined`).toBe(true);
    }
    for (const name of ['--panel', '--border', '--danger']) {
      expect(() => resolveColor(`var(${name})`, surfaceBase)).not.toThrow();
    }
  });

  it('--text-faint and --text-muted clear WCAG 2.2 AA (>=4.5:1) on base and panel', () => {
    for (const token of ['--text-faint', '--text-muted']) {
      const fg = resolveColor(`var(${token})`, surfaceBase);
      expect(contrast(fg, surfaceBase), `${token} on --surface-base`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(fg, surfacePanel), `${token} on --surface-panel`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('exposes the full 8-pt --sp-* spacing scale in px', () => {
    const sp = [...vars.keys()].filter((k) => /^--sp-\d+$/.test(k));
    expect(sp.length).toBeGreaterThanOrEqual(8);
    for (const k of sp) expect(vars.get(k), `${k} is a px value`).toMatch(/^\d+px$/);
    // 8-pt base anchor present and correct.
    expect(vars.get('--sp-8')).toBe('8px');
    expect(vars.get('--sp-16')).toBe('16px');
  });

  it('registers a global :focus-visible ring driven by the focus token', () => {
    const rule = cssNoComments.match(/:focus-visible[^{]*\{([^}]*)\}/);
    expect(rule, ':focus-visible rule present').toBeTruthy();
    expect(rule![1]).toMatch(/outline/);
    expect(rule![1]).toMatch(/var\(--focus-ring\)/);
    expect(vars.has('--focus-ring')).toBe(true);
  });
});

describe('error boundaries consume only defined tokens', () => {
  it.each(['src/app/error.tsx', 'src/app/global-error.tsx'])(
    '%s references only defined tokens',
    (rel) => {
      const missing = tokenRefs(read(rel)).filter((name) => !vars.has(name));
      expect(missing).toEqual([]);
    },
  );

  it('renders error.tsx with defined, resolvable tokens', () => {
    render(<ErrorBoundary error={new Error('boom')} reset={() => {}} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    for (const name of tokenRefs(read('src/app/error.tsx'))) {
      expect(vars.has(name), `token ${name} is defined`).toBe(true);
    }
  });
});
