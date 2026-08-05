# 10. Accept an EOL ESLint 9 until eslint-plugin-react supports ESLint 10

Date: 2026-08-04

## Status

Accepted.

## Context

ESLint 9 reaches end of life on **2026-08-06**, two days after this ADR's date.
After that there are no further ESLint 9 releases, security or otherwise. The
repo pins `eslint@9.39.4` and `eslint-config-next@16.2.11`, and CLAUDE.md carried
the bump as _tracked_ work: "hold ESLint 9 (config-next's bundled
eslint-plugin-react calls `getFilename()`, removed in ESLint 10); tracked bump
before ESLint 9 EOL 2026-08-06."

The bump was attempted on 2026-08-04 (branch `chore/eslint-10-bump`) with
`eslint@10.8.0` + `eslint-config-next@16.3.0`, and reverted rather than shipped
broken. It does not fail on our config; it fails at rule load:

```
TypeError: Error while loading rule 'react/display-name':
contextOrFilename.getFilename is not a function
  at eslint-plugin-react/lib/util/version.js:31
```

"Tracked" is the wrong word for work that cannot be done, and the difference
matters: a tracked bump implies somebody has to get around to it, while this one
is waiting on a package we do not publish. This ADR replaces the tracking note
with a decision.

### The gate is one package, and it is named

`eslint-plugin-react` is the gate. Verified against the registry on 2026-08-04:

| Fact                                                | Value on 2026-08-04                                    |
| --------------------------------------------------- | ------------------------------------------------------ |
| `eslint-plugin-react` latest                        | `7.37.5`                                               |
| its `peerDependencies.eslint`                       | `^3 \|\| ^4 \|\| ^5 \|\| ^6 \|\| ^7 \|\| ^8 \|\| ^9.7` |
| its `next` dist-tag                                 | `7.8.0-rc.0`, peered `^3.0.0 \|\| ^4.0.0`              |
| `eslint-config-next@latest` (16.3.0) depends on     | `eslint-plugin-react@^7.37.0`                          |
| `eslint-config-next@canary` (16.3.1-canary.1) ditto | `eslint-plugin-react@^7.37.0`                          |

No published release of the plugin admits ESLint 10, on any channel. The `next`
dist-tag is not an escape hatch: it points at a stale 2015 release-candidate
peered to `eslint ^3 || ^4`, i.e. it is older than latest, not newer. And because
`eslint-config-next` depends on `^7.37.0` at both `latest` and `canary`, there is
no npm `overrides` entry that reaches a compatible version — an override can force
a version, but there is no compatible version to force.

**`typescript-eslint` is not the gate, and a future reader should not
re-diagnose it.** The tree's own `typescript-eslint@8.63.0` already peers
`eslint: ^8.57.0 || ^9.0.0 || ^10.0.0` (as does latest, 8.66.0). It was the
plausible suspect — CLAUDE.md holds TypeScript 6 partly on typescript-eslint — and
it is clear.

**What is _not_ established: that the React plugin is the only obstacle, merely
that it is the first and the only hard one.** The attempt died at rule load, so
everything downstream of it is untested. Two sibling plugins that
`eslint-config-next` also pulls declare peer ranges that stop at `^9`:
`eslint-plugin-jsx-a11y@6.10.2` and `eslint-plugin-import@2.32.0`. Neither
crashed, because nothing got that far. `eslint-plugin-react-hooks@7.1.1` and
`@next/eslint-plugin-next` are clear (the former peers `^10.0.0`; the latter
declares no eslint peer at all). So the re-attempt below is a re-attempt, not a
formality.

### What the risk actually is, and what it is not

ESLint is a `devDependency`. It runs in `npm run lint`, in the CI lint step, and
in `lint-staged`. It **reaches no production artifact**: it is not bundled, not
imported by `src/`, not deployed to Vercel, and never executes in a user's
browser or in a request path. Running an unsupported linter therefore exposes:

- **A build-time tool with no upstream security patches**, executed over our own
  source by us and by GitHub Actions runners.

It does **not** expose:

- any deployed code path, any user, any request, any credential the app holds, or
  the hosted MCP endpoint that [ADR-0006](0006-mcpwn-is-the-mcp-server.md) treats
  as inbound attack surface. The threat model of the deployed product is
  unchanged by this decision, in either direction.

The honest way to say it: an EOL linter is a **supply-chain and maintenance**
concern in the dev toolchain, not a vulnerability in MCPwn. Treating it as the
latter would be security theatre, and treating it as nothing would be the
opposite mistake — it is a real, dated debt with a named owner upstream.

## Decision

**Accept running EOL ESLint 9 (`9.39.4`) with `eslint-config-next@16.2.11` until
`eslint-plugin-react` publishes ESLint 10 support.** Do not drop
`eslint-config-next` to get off ESLint 9, and do not patch or fork the plugin.

### 1. What would change this decision

Two observable events, either of which reopens it immediately rather than at the
re-attempt trigger:

- **A lint-time RCE (or equivalent) is published against a package in the held
  tree** — `eslint@9.x` itself, or one of the plugins it loads. ESLint 9 will
  receive no fix, so the response is not "wait for upstream": it is to drop
  `eslint-config-next` and hand-assemble a flat config from the plugins that do
  support ESLint 10 — accepting the loss of the curated Next config and of every
  rule set whose plugin has no ESLint 10 release — or to remove the affected
  plugin outright.
- **CI images stop offering the Node/ESLint combination the held tree needs.**
  ESLint 9 supports a Node range that the `ubuntu-latest` runner and our pinned
  Node version currently satisfy. If a runner image bump makes the held tree
  uninstallable or unrunnable, the linter stops being merely unsupported and
  starts being broken, and the same fallback applies.

Ordinary advisory noise in the dev tree is **not** a trigger. It is handled the
way the two `brace-expansion` advisories already are (below): resolve it with a
pin or an override where a patched version can be reached, allowlist with a
recorded reason where it cannot.

### 2. The re-attempt trigger, and how to check it

Re-attempt when **both** hold:

1. `eslint-plugin-react` publishes a release whose `peerDependencies.eslint`
   range contains `^10`; **and**
2. `eslint-config-next`'s dependency range on `eslint-plugin-react` admits that
   release (i.e. the range moves, or the new release is a minor within `^7`).

Condition 1 alone is not enough — a compatible plugin that
`eslint-config-next` will not resolve to leaves us exactly where we are.

```sh
npm view eslint-plugin-react peerDependencies.eslint && npm view eslint-config-next dependencies.eslint-plugin-react
```

On 2026-08-04 that prints `^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9.7` then
`^7.37.0` — neither condition met. When the first line contains `^10` and the
second admits the release carrying it, re-run the bump on a branch, and expect to
then discover whether `eslint-plugin-jsx-a11y` and `eslint-plugin-import` are
also ready.

### 3. Both `brace-expansion` allowlists stay

`audit-ci.json` allowlists **GHSA-mh99-v99m-4gvg** and **GHSA-rgw5-rvv9-x895**
(added 2026-08-03). Their original justification said they would be re-evaluated
and dropped "at that bump". The bump did not happen, and **the tree they were
justified against is byte-for-byte unchanged**, so the justification is intact
rather than expired. Both entries stay.

Re-verified on 2026-08-04, in this exact tree:

```
$ npm ls brace-expansion --omit=dev
mcpwn@0.1.0
`-- (empty)
```

Empty — **zero presence in the production tree**. Both instances are dev-only and
sit exactly where the 2026-08-03 note said: `eslint@9.39.4 → minimatch@3.1.5 →
brace-expansion@1.1.16`, and `eslint-config-next@16.2.11 → typescript-eslint@8.63.0
→ @typescript-eslint/typescript-estree → minimatch@10.2.5 → brace-expansion@5.0.7`.
Both paths run through the held ESLint tree, which is why the remediation was tied
to the bump in the first place. Patched versions (1.1.18, 5.0.9) exist, but npm
`overrides` do not reach that transitive depth in this tree and a tree-wide
override crashes `@eslint/config-array`.

The rule from 2026-08-03 is unchanged and this decision does not weaken it:
**allowlist only when a patched version cannot be resolved, never merely because
the advisory is dev-only.** These two qualify on the first clause. The allowlist
is re-evaluated when the re-attempt trigger fires, not on a calendar.

## Consequences

**Positive**

- The state of the dependency is written down as a decision with a trigger, so
  the next reader does not re-run the failed bump to rediscover the same
  `TypeError`, and does not re-diagnose `typescript-eslint`.
- The risk is stated at its true size in both directions — no production
  exposure, and a real unpatched build-time tool — which is what makes the two
  escalation conditions meaningful rather than decorative.
- The `brace-expansion` allowlist keeps a live justification instead of an
  expired promise. An allowlist whose stated removal condition has silently
  passed is worse than no allowlist, because it looks reviewed.

**Negative / costs**

- We knowingly run an unsupported linter, and the exposure grows with time. There
  is no date by which this self-corrects; it ends when upstream ships.
- `eslint@9.39.5` sits on the `maintenance` dist-tag while we pin `9.39.4`.
  Taking it is a small, separate change (it touches `package.json` and the
  lockfile, which this documentation-only change must not), and it buys one patch
  release, not support.
- Two `brace-expansion` advisories stay suppressed for an open-ended period
  rather than the bounded one originally implied.
- The decision is re-checked by a human running one command. Nothing automated
  notices when the trigger fires.

**Alternatives considered**

- **Drop `eslint-config-next` and hand-assemble a flat config on ESLint 10.**
  Rejected _for now_, and kept as the escalation path above. `@next/eslint-plugin-next`
  and `eslint-plugin-react-hooks` are ESLint 10 clean, so a reduced config is
  reachable — but only a reduced one: the React, jsx-a11y and import rule sets all
  come from plugins that do not yet declare ESLint 10 support, so this trades the
  curated Next config for a hand-maintained config that also lints less, in
  exchange for zero production risk reduction. Reasonable if a trigger fires; not
  reasonable merely to hit an EOL date.
- **Patch or fork `eslint-plugin-react` (patch-package, or an npm override to a
  fork).** Rejected: the failure is in the plugin's ESLint-version detection, and
  a hand-patched linter internal is unreviewable in review and silently diverges
  at every plugin release. Carrying a fork of a 100-rule plugin to satisfy a
  toolchain date is more risk than the date removes.
- **Bump ESLint 10 and disable the React rules that crash.** Rejected: the crash
  is at plugin load in version detection, not in one rule, so it is not
  selectively disableable. Even if it were, a linter configured around its own
  breakage reports green while checking less than it claims — the asserted-vs-
  measured gap this project exists to close ([ADR-0004](0004-design-frozen-and-impeccable-as-craft-gate.md)).
- **Drop linting from CI until the bump is possible.** Rejected outright. The
  Definition of Done makes lint an authoritative CI gate; removing a working
  check because the tool running it is unsupported trades a real, current
  guarantee for a theoretical one.

_References: `audit-ci.json` (both allowlist entries), `package.json`
(`eslint@9.39.4`, `eslint-config-next@16.2.11`), branch `chore/eslint-10-bump`
(the attempt and its revert), CLAUDE.md § Dependencies, plan.md row L13._
