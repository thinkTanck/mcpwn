import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { createRequire } from 'node:module';
import { compile } from 'tailwindcss';
import { contrast, hexToRgb } from '../support/wcag';

/**
 * THREE-ROLE type model — RESOLVED values, not class strings.
 *
 * A class-name assertion cannot see a cascade defect. The role classes
 * (`.reading`, `.instrument`, `.readout`, `.micro-label`, `.display*`) set
 * font-family and font-size; Tailwind v4 emits every utility inside
 * `@layer utilities`. An UNLAYERED rule beats every layered one regardless of
 * specificity, so while the role classes sat outside a layer, `text-[15px]` or
 * `font-mono` on a `.reading` element was INERT — the markup said one size and
 * the browser painted another. The same defect was found and fixed for COLOUR
 * (the role colours moved into `@layer base`); SIZE and FAMILY were missed.
 *
 * So this suite resolves declarations the way a browser does — over the REAL
 * compiled stylesheet (globals.css run through Tailwind with the candidates
 * actually used in src/), ordered by cascade layer, then specificity, then
 * source order. jsdom is not usable here: it parses `@layer` into
 * CSSLayerBlockRule but never applies it (getComputedStyle returns `medium`),
 * so a getComputedStyle assertion would be vacuous in exactly the case that
 * matters.
 *
 * Scope note: rules nested in a conditional at-rule (`@media`, `@supports`) are
 * skipped, so these are the base-viewport, no-preference resolved values.
 */

const require = createRequire(import.meta.url);
const root = process.cwd();

// --- harvest the candidates Tailwind must generate --------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(entry)) out.push(p);
  }
  return out;
}

const sourceFiles = walk(join(root, 'src'));

/** Every whitespace-delimited token inside a quoted string — a superset of the
 *  class names in use, which is what Tailwind's own scanner works from. */
function candidatesOf(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g)) {
    for (const tok of (m[2] ?? '').split(/\s+/)) if (tok) out.push(tok);
  }
  return out;
}

const candidates = [
  ...new Set([
    ...sourceFiles.flatMap((f) => candidatesOf(readFileSync(f, 'utf8'))),
    // Probe candidates used by the composition specs below.
    'text-[15px]',
    'font-mono',
    'font-sans',
    'text-nominal',
    'leading-relaxed',
  ]),
];

// --- compile the real stylesheet -------------------------------------------

async function loadStylesheet(id: string, base: string) {
  const path =
    id === 'tailwindcss'
      ? require.resolve('tailwindcss/index.css')
      : id.startsWith('.')
        ? resolvePath(base, id)
        : require.resolve(id, { paths: [base] });
  return { path, base: dirname(path), content: readFileSync(path, 'utf8') };
}

const globalsPath = join(root, 'src/app/globals.css');
const globalsCss = readFileSync(globalsPath, 'utf8');
const compiler = await compile(globalsCss, { base: root, loadStylesheet });
const compiled = compiler.build(candidates);

// --- a minimal, cascade-correct resolver ------------------------------------

type Decl = { prop: string; value: string; important: boolean };
type Rule = { selectors: string[]; decls: Decl[]; layer: number; order: number };

const layerOrder: string[] = [];
const layerIndex = (name: string | null): number => {
  if (name === null) return Number.MAX_SAFE_INTEGER; // unlayered wins over every layer
  const i = layerOrder.indexOf(name);
  return i === -1 ? layerOrder.push(name) - 1 : i;
};

function parseDecls(body: string): Decl[] {
  const decls: Decl[] = [];
  let depth = 0;
  let buf = '';
  const flush = () => {
    const text = buf.trim();
    buf = '';
    if (!text) return;
    const i = text.indexOf(':');
    if (i === -1) return;
    const prop = text.slice(0, i).trim();
    let value = text.slice(i + 1).trim();
    const important = /!important$/.test(value);
    if (important) value = value.replace(/!important$/, '').trim();
    decls.push({ prop, value, important });
  };
  for (const ch of body) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ';' && depth === 0) flush();
    else buf += ch;
  }
  flush();
  return decls;
}

/** Split a stylesheet body into rules, tracking the enclosing cascade layer.
 *  Conditional at-rules (@media/@supports/@keyframes) are skipped entirely. */
function parseRules(css: string, layer: string | null, rules: Rule[] = []): Rule[] {
  let i = 0;
  while (i < css.length) {
    // Statement at-rule (`@layer a, b, c;`) — declares layer order.
    const stmt = /^\s*@([\w-]+)([^{;]*);/.exec(css.slice(i));
    if (stmt) {
      if (stmt[1] === 'layer') {
        for (const name of (stmt[2] ?? '').split(',')) {
          const n = name.trim();
          if (n) layerIndex(n);
        }
      }
      i += stmt[0].length;
      continue;
    }
    const braceAt = css.indexOf('{', i);
    if (braceAt === -1) break;
    const prelude = css.slice(i, braceAt).trim();
    // Find the matching close brace.
    let depth = 0;
    let j = braceAt;
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    const body = css.slice(braceAt + 1, j);
    i = j + 1;

    if (prelude.startsWith('@layer')) {
      const name = prelude.slice(6).trim() || null;
      if (name) layerIndex(name);
      parseRules(body, name, rules);
    } else if (prelude.startsWith('@')) {
      // @media / @supports / @keyframes / @property — out of scope (see header).
      continue;
    } else {
      rules.push({
        selectors: splitTop(prelude, ','),
        decls: parseDecls(body),
        layer: layerIndex(layer),
        order: rules.length,
      });
    }
  }
  return rules;
}

/** Split on a delimiter that is not inside (), [] or a backslash escape. */
function splitTop(input: string, delim: string): string[] {
  const out: string[] = [];
  let buf = '';
  let depth = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (ch === '\\') {
      buf += ch + (input[i + 1] ?? '');
      i++;
      continue;
    }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === delim && depth === 0) {
      out.push(buf.trim());
      buf = '';
    } else buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** Comments are stripped first: Tailwind's own banner comment sits ahead of the
 *  `@layer …;` statement, and a comment-aware-less scan would swallow it. */
const rules = parseRules(compiled.replace(/\/\*[\s\S]*?\*\//g, ''), null);

/** Class names of a compound selector, or null if the selector is anything more
 *  complex than a class-only compound (combinators, pseudos, attributes). */
function compoundClasses(selector: string): string[] | null {
  const classes: string[] = [];
  let cur: string | null = null;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i]!;
    if (ch === '\\') {
      cur = (cur ?? '') + (selector[i + 1] ?? '');
      i++;
      continue;
    }
    if (ch === '.') {
      if (cur !== null) classes.push(cur);
      cur = '';
      continue;
    }
    if (cur === null) return null; // a tag / pseudo / attribute prefix
    if (/[\s>+~:[\]()*,#]/.test(ch)) return null;
    cur += ch;
  }
  if (cur !== null) classes.push(cur);
  return classes.length ? classes : null;
}

const specificity = (selector: string) => (compoundClasses(selector)?.length ?? 0) * 10;

/** The custom-property table on :root, resolved through the same cascade. */
const rootVars = new Map<string, string>();
for (const rule of [...rules].sort((a, b) =>
  a.layer !== b.layer ? a.layer - b.layer : a.order - b.order,
)) {
  if (!rule.selectors.some((s) => s === ':root' || s === ':host')) continue;
  for (const d of rule.decls) if (d.prop.startsWith('--')) rootVars.set(d.prop, d.value);
}

/** Substitute var() references against the :root table (fallbacks honoured). */
function substitute(value: string, seen = new Set<string>()): string {
  return value.replace(
    /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g,
    (_, name: string, fb?: string) => {
      if (seen.has(name)) return fb ?? '';
      const declared = rootVars.get(name);
      if (declared === undefined) return fb === undefined ? '' : substitute(fb, seen);
      return substitute(declared, new Set([...seen, name]));
    },
  );
}

/** The resolved value of `prop` for an element carrying `classes`. */
function resolved(classes: string[], prop: string): string {
  const have = new Set(classes);
  const winners = rules
    .flatMap((rule) =>
      rule.selectors
        .filter((sel) => {
          const need = compoundClasses(sel);
          return need !== null && need.every((c) => have.has(c));
        })
        .map((sel) => ({ rule, spec: specificity(sel) })),
    )
    .flatMap(({ rule, spec }) =>
      rule.decls
        .filter((d) => d.prop === prop)
        .map((d) => ({ d, spec, layer: rule.layer, order: rule.order })),
    )
    .sort((a, b) => {
      if (a.d.important !== b.d.important) return a.d.important ? 1 : -1;
      if (a.layer !== b.layer) return a.layer - b.layer;
      if (a.spec !== b.spec) return a.spec - b.spec;
      return a.order - b.order;
    });
  const win = winners.at(-1);
  return win ? substitute(win.d.value).trim() : '';
}

const px = (classes: string[]): number => {
  const v = resolved(classes, 'font-size');
  const m = /^([\d.]+)px$/.exec(v);
  if (!m) throw new Error(`font-size for [${classes.join(' ')}] is not a px value: "${v}"`);
  return parseFloat(m[1]!);
};

const family = (classes: string[]): 'sans' | 'mono' | 'none' => {
  const v = resolved(classes, 'font-family');
  if (/monospace|mono\b/.test(v)) return 'mono';
  if (/sans-serif|\bsans\b/.test(v)) return 'sans';
  return 'none';
};

/** Contrast of the resolved text colour against the page surface. Both screens
 *  below paint on --surface-base (verified in the built app); the token tiers
 *  are separately asserted AA on --surface-panel in tokens.test.tsx. */
const onSurfaceBase = (classes: string[]): number => {
  const fg = substitute(resolved(classes, 'color')).trim();
  const bg = substitute('var(--surface-base)').trim();
  if (!/^#[0-9a-f]{3,8}$/i.test(fg)) throw new Error(`colour did not resolve to a hex: "${fg}"`);
  return contrast(hexToRgb(fg), hexToRgb(bg));
};

// --- the roles --------------------------------------------------------------

const READING = ['reading', 'reading-lead', 'reading-h1', 'reading-h2', 'reading-h3'];
const INSTRUMENT = ['instrument', 'instrument-faint', 'readout', 'micro-label'];
const DISPLAY = ['display', 'display-md', 'display-lg', 'display-xl'];
const ROLE_CLASSES = [...READING, ...INSTRUMENT, ...DISPLAY];

describe('the resolver sees the real stylesheet', () => {
  it('compiles globals.css with Tailwind and finds the utility layer', () => {
    expect(layerOrder).toContain('utilities');
    expect(layerOrder).toContain('base');
    expect(layerOrder.indexOf('base')).toBeLessThan(layerOrder.indexOf('utilities'));
    expect(resolved(['text-[15px]'], 'font-size')).toBe('15px');
  });
});

describe('type roles compose with Tailwind utilities (the cascade contract)', () => {
  it('a size utility on a role class WINS — the role must not be unlayered', () => {
    expect(px(['reading', 'text-[15px]'])).toBe(15);
    expect(px(['readout', 'text-[15px]'])).toBe(15);
    expect(px(['micro-label', 'text-[15px]'])).toBe(15);
    expect(px(['display', 'text-[15px]'])).toBe(15);
  });

  it('a family utility on a role class WINS', () => {
    expect(family(['reading', 'font-mono'])).toBe('mono');
    expect(family(['instrument', 'font-sans'])).toBe('sans');
  });

  it('a rhythm utility on a role class WINS', () => {
    expect(resolved(['instrument-faint', 'leading-relaxed'], 'line-height')).toBe('1.625');
  });

  it('a colour utility on a role class WINS (the defect already fixed for colour)', () => {
    expect(resolved(['micro-label', 'text-nominal'], 'color')).toBe(
      resolved(['text-nominal'], 'color'),
    );
    expect(resolved(['reading', 'text-ink-muted'], 'color')).toBe(
      resolved(['text-ink-muted'], 'color'),
    );
  });

  it('every type-role class is declared inside a cascade layer', () => {
    // The structural cause. An unlayered class rule beats EVERY layered utility
    // regardless of specificity, which is what made the size utilities inert.
    const unlayered = rules.filter((r) => r.layer === Number.MAX_SAFE_INTEGER);
    const offenders = unlayered
      .flatMap((r) => r.selectors)
      .map((s) => compoundClasses(s) ?? [])
      .flat()
      .filter((c) => ROLE_CLASSES.includes(c));
    expect([...new Set(offenders)]).toEqual([]);
  });
});

describe('the role defaults still hold when nothing overrides them', () => {
  it('READING is sans and never below the 16px prose floor', () => {
    for (const role of READING) {
      if (role === 'reading-h1') continue; // clamp(), asserted in tokens.test
      expect(family([role]), role).toBe('sans');
      expect(px([role]), role).toBeGreaterThanOrEqual(16);
    }
  });

  it('INSTRUMENT is mono telemetry at 13–14px', () => {
    for (const role of INSTRUMENT) {
      expect(family([role]), role).toBe('mono');
      expect(px([role]), role).toBeGreaterThanOrEqual(12);
      expect(px([role]), role).toBeLessThanOrEqual(14);
    }
  });

  it('DISPLAY carries the scale and lets the design own the family', () => {
    expect(px(['display'])).toBe(15);
    expect(px(['display-md'])).toBe(20);
    expect(px(['display-lg'])).toBe(28);
    expect(px(['display-xl'])).toBe(40);
    expect(family(['display'])).toBe('none');
    // Distinctness is measurable, not asserted by name (CLAUDE.md).
    expect(px(['display'])).toBeGreaterThan(px(['micro-label']));
    expect(px(['reading'])).toBeGreaterThan(px(['readout']));
  });
});

// --- every real call site in src/ ------------------------------------------

type Site = { file: string; line: number; classes: string[] };

/** The class list of every `className` in a file: `className="…"` verbatim, and
 *  every quoted string inside a `className={…}` expression (a `cn(...)` call
 *  composes one element's classes, so its branches are ORed onto the same
 *  element and each is checked on its own). Scanning `className` rather than
 *  every string literal is deliberate: an apostrophe in a prose comment makes a
 *  whole-file string scan swallow the attributes that follow it. */
function classListsOf(source: string): { line: number; classes: string[] }[] {
  const found: { line: number; classes: string[] }[] = [];
  const push = (index: number, raw: string) => {
    const classes = raw.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    if (classes.length) found.push({ line: source.slice(0, index).split('\n').length, classes });
  };
  for (const m of source.matchAll(/className\s*=\s*/g)) {
    let i = (m.index ?? 0) + m[0].length;
    if (source[i] === '"' || source[i] === "'") {
      const quote = source[i]!;
      const end = source.indexOf(quote, i + 1);
      if (end === -1) continue;
      push(i, source.slice(i + 1, end));
      continue;
    }
    if (source[i] !== '{') continue;
    let depth = 0;
    const start = i;
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    const expr = source.slice(start, i + 1);
    for (const s of expr.matchAll(/(["'`])((?:\\.|(?!\1)[^\n])*?)\1/g)) push(start, s[2] ?? '');
  }
  return found;
}

function callSites(): Site[] {
  const sites: Site[] = [];
  for (const file of sourceFiles) {
    const source = readFileSync(file, 'utf8');
    for (const { line, classes } of classListsOf(source)) {
      if (!classes.some((c) => ROLE_CLASSES.includes(c))) continue;
      sites.push({ file: file.slice(root.length + 1).replace(/\\/g, '/'), line, classes });
    }
  }
  return sites;
}

const sites = callSites();
const where = (s: Site) => `${s.file}:${s.line} [${s.classes.join(' ')}]`;

describe('every type-role call site in src/ resolves to the role it wears', () => {
  it('finds the role call sites', () => {
    expect(sites.length).toBeGreaterThan(20);
  });

  it('a READING element resolves to sans prose at or above the 16px floor', () => {
    // The inverse of "prose never wears an INSTRUMENT role": an element wearing
    // READING must not resolve to mono telemetry, or to an off-scale size below
    // the prose floor, once the utilities on it actually apply.
    const bad = sites
      .filter((s) => s.classes.some((c) => READING.includes(c)))
      .filter((s) => !s.classes.includes('reading-h1'))
      .filter((s) => family(s.classes) !== 'sans' || px(s.classes) < 16)
      .map((s) => `${where(s)} → ${px(s.classes)}px ${family(s.classes)}`);
    expect(bad).toEqual([]);
  });

  it('an INSTRUMENT element resolves to mono telemetry at 14px or below', () => {
    const bad = sites
      .filter((s) => s.classes.some((c) => INSTRUMENT.includes(c)))
      .filter((s) => family(s.classes) !== 'mono' || px(s.classes) > 14)
      .map((s) => `${where(s)} → ${px(s.classes)}px ${family(s.classes)}`);
    expect(bad).toEqual([]);
  });

  it('a DISPLAY element resolves at or above the 15px focal-value floor', () => {
    const bad = sites
      .filter((s) => s.classes.some((c) => DISPLAY.includes(c)))
      .filter((s) => px(s.classes) < 15)
      .map((s) => `${where(s)} → ${px(s.classes)}px`);
    expect(bad).toEqual([]);
  });

  it('no element wears two different type roles at once', () => {
    const bad = sites
      .filter(
        (s) =>
          [READING, INSTRUMENT, DISPLAY].filter((role) => s.classes.some((c) => role.includes(c)))
            .length > 1,
      )
      .map(where);
    expect(bad).toEqual([]);
  });
});

// --- the two adjudicated prose-vs-telemetry flags ---------------------------

/**
 * "Prose NEVER wears an INSTRUMENT role" is a blocking rule, but the size/family
 * resolver above cannot tell a sentence from a label — that reading is a
 * judgement, made once and then pinned here so it is not re-litigated.
 *
 * Two elements were flagged. They were adjudicated separately, on the nature of
 * the TEXT against the CLAUDE.md definition (INSTRUMENT = "telemetry only:
 * labels, chips, metadata, cues, column/row headers"):
 *
 *   Home, "Featured run: memory poisoning. Pick any of the Core-7 to watch its
 *   own attack." — PROSE. Two complete sentences; the second is an imperative
 *   addressed to the reader, with a finite verb and a purpose clause. No label,
 *   chip or column header is a sentence that tells a human what to do. Moved to
 *   READING.
 *
 *   Leaderboard, "Cell -> its run in Live Attack Replay" — TELEMETRY. A legend:
 *   a source-to-destination mapping with no finite verb, read by scanning the
 *   grid rather than by reading a line. That is a key/cue, which the definition
 *   names explicitly. Kept as INSTRUMENT.
 *
 * Both are asserted on RESOLVED values, so the disposition cannot rot into a
 * class name that no longer means what it says.
 */

/** The class list of the element rendering `copy` — the nearest `className`
 *  attribute preceding it in the source. Throws if the copy has moved, so a
 *  reworded line fails loudly instead of silently unhooking the guard. */
function classesRendering(file: string, copy: string): string[] {
  const source = readFileSync(join(root, file), 'utf8');
  const at = source.indexOf(copy);
  if (at === -1) throw new Error(`copy not found in ${file}: "${copy}"`);
  const opener = [...source.slice(0, at).matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)].at(-1);
  if (!opener) throw new Error(`no className precedes the copy in ${file}`);
  return (opener[1] ?? opener[2] ?? '').split(/\s+/).filter(Boolean);
}

const HOME = 'src/app/(hud)/page.tsx';
const HOME_COPY = 'Featured run: memory poisoning.';
const LEADERBOARD = 'src/components/leaderboard/LeaderboardHeatmap.tsx';
const LEADERBOARD_COPY = 'Cell → its run in Live Attack Replay';

describe('the adjudicated prose-vs-telemetry dispositions hold', () => {
  it('Home: the featured-run line is prose, so it reads at a READING size in sans', () => {
    const classes = classesRendering(HOME, HOME_COPY);
    const detail = `[${classes.join(' ')}] -> ${px(classes)}px ${family(classes)}`;
    expect(
      classes.filter((c) => INSTRUMENT.includes(c)),
      detail,
    ).toEqual([]);
    expect(
      classes.some((c) => READING.includes(c)),
      detail,
    ).toBe(true);
    expect(family(classes), detail).toBe('sans');
    // READING body is 17px, lead 18px — a caption takes body, never below it.
    expect(px(classes), detail).toBeGreaterThanOrEqual(17);
  });

  it('Home: the featured-run line still clears WCAG 2.2 AA on the page surface', () => {
    const classes = classesRendering(HOME, HOME_COPY);
    expect(onSurfaceBase(classes)).toBeGreaterThanOrEqual(4.5);
  });

  it('Leaderboard: the cell legend stays INSTRUMENT telemetry', () => {
    const classes = classesRendering(LEADERBOARD, LEADERBOARD_COPY);
    const detail = `[${classes.join(' ')}] -> ${px(classes)}px ${family(classes)}`;
    expect(
      classes.some((c) => INSTRUMENT.includes(c)),
      detail,
    ).toBe(true);
    expect(family(classes), detail).toBe('mono');
    expect(px(classes), detail).toBeLessThanOrEqual(13);
    expect(onSurfaceBase(classes)).toBeGreaterThanOrEqual(4.5);
  });
});
