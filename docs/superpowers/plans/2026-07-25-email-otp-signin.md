# Email OTP sign-in (Slice 1.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the email magic-link verification with a code-only, two-step Email OTP sign-in (enter email, then type a 6-digit code), fully verifiable on prod without an inbox.

**Architecture:** Two server actions (`requestEmailCode` → `signInWithOtp`; `verifyEmailCode` → `verifyOtp`) drive a two-step client `SignInPanel`. `verifyOtp` sets the SSR session cookies and the action redirects to a sanitized `next`. No `/auth/callback` and no PKCE for the email path; the callback route is kept unchanged for GitHub OAuth only.

**Tech Stack:** Next.js 16 App Router (server actions, async server components), `@supabase/ssr` + `@supabase/supabase-js`, Vitest + @testing-library/react, TypeScript.

**Spec:** `docs/superpowers/specs/2026-07-25-email-otp-signin-design.md` (approved 2026-07-25).

## Global Constraints

- Attribution: commits authored by `thinkTanck` only. NO `Co-Authored-By: Claude` trailer, no "Generated with Claude Code" in PR bodies.
- Repo stays PRIVATE. `main` is protected: land via branch → PR → green CI → squash-merge (linear history).
- No em dashes in UI copy.
- commitlint: commit subject must be lowercase.
- Offline-safe: with auth inert (`createServerSupabase()` returns null) every action is a no-op returning `{ ok: false }`; the panel keeps its preview state. No new required env vars.
- WCAG 2.2 AA; state via text + icon, never color alone.
- Coverage thresholds (CI): statements/lines/functions 80, branches 70. `npx impeccable detect src/` must be clean.
- Pre-commit hooks (husky + lint-staged + commitlint) run on every commit; do not bypass with `--no-verify`.
- Existing types reused: `AuthResult = { ok: true } | { ok: false; error: string }` (in `src/lib/auth/actions.ts`).

## HARD PROD PREREQUISITE (blocking; Task 6)

`signInWithOtp` emails using Supabase templates that default to a clickable link. The **operator must** edit **Authentication → Email Templates → Magic Link AND Confirm signup** to emit `{{ .Token }}` and drop the link (exact HTML in the spec). New emails use "Confirm signup"; returning use "Magic Link". Without this the email still sends a link and the flow cannot work. This is verified live before sign-off (Task 6, with a real-send self-check: the email contains a code and no link).

## File Structure

- `src/lib/auth/actions.ts` (modify): remove `sendMagicLink`; add `requestEmailCode`, `verifyEmailCode`, and a private `sanitizeNext` helper. Keep `startGitHubOAuth`, `signOut`, `siteOrigin`.
- `src/components/signin/SignInPanel.tsx` (modify): two-step client component (`email` → `code`), resend cooldown, "use a different email", verify wiring; rename the OAuth-failure prop `linkError` → `authError` with sign-in-generic copy.
- `src/app/sign-in/page.tsx` (modify): read + pass `next`; pass `authError`.
- `tests/unit/lib/auth/actions.test.ts` (modify): retarget to `requestEmailCode` + `verifyEmailCode`.
- `tests/unit/components/signin/SignInPanel.test.tsx` (modify): two-step, verify error, resend cooldown, back-to-email, `authError` surface.
- `tests/unit/app/signin.test.tsx` (modify): `next` + `authError` passthrough.
- `src/app/auth/callback/route.ts`: UNCHANGED (OAuth only).

---

## Task 1: `requestEmailCode` server action (rename + code flow)

**Files:**

- Modify: `src/lib/auth/actions.ts`
- Modify: `src/components/signin/SignInPanel.tsx` (import + call site only)
- Test: `tests/unit/lib/auth/actions.test.ts`

**Interfaces:**

- Produces: `requestEmailCode(email: string): Promise<AuthResult>`. Calls `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`. No `emailRedirectTo` (code flow has no return URL). Inert `{ ok: false, error: 'Sign-in is not configured yet.' }` when `createServerSupabase()` is null.

- [ ] **Step 1: Rewrite the action test (RED).** Replace the `sendMagicLink` describe block in `tests/unit/lib/auth/actions.test.ts` with:

```ts
import { requestEmailCode } from '@/lib/auth/actions';
// keep the existing next/headers, next/navigation, and server mocks

const mockOtp = (otp: ReturnType<typeof vi.fn>) =>
  vi.mocked(createServerSupabase).mockResolvedValue({ auth: { signInWithOtp: otp } } as never);

describe('requestEmailCode (email OTP request)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is inert (ok:false) when auth is not configured', async () => {
    vi.mocked(createServerSupabase).mockResolvedValue(null);
    expect((await requestEmailCode('a@b.com')).ok).toBe(false);
  });

  it('sends a code via signInWithOtp (no emailRedirectTo)', async () => {
    const otp = vi.fn().mockResolvedValue({ error: null });
    mockOtp(otp);
    expect(await requestEmailCode('a@b.com')).toEqual({ ok: true });
    expect(otp).toHaveBeenCalledWith({ email: 'a@b.com', options: { shouldCreateUser: true } });
  });

  it('surfaces the provider error', async () => {
    const otp = vi.fn().mockResolvedValue({ error: { message: 'email rate limit exceeded' } });
    mockOtp(otp);
    expect(await requestEmailCode('a@b.com')).toEqual({
      ok: false,
      error: 'email rate limit exceeded',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails.** Run: `node node_modules/vitest/vitest.mjs run tests/unit/lib/auth/actions.test.ts` — Expected: FAIL (`requestEmailCode` is not exported).

- [ ] **Step 3: Implement (GREEN).** In `src/lib/auth/actions.ts`, replace `sendMagicLink` with:

```ts
/**
 * Email OTP: send the address a 6-digit code (Supabase templates must emit
 * `{{ .Token }}`). Returns a typed result so the panel can advance to the code
 * step or show a failure without leaving the page. Inert when auth is not
 * configured.
 */
export async function requestEmailCode(email: string): Promise<AuthResult> {
  const supabase = await createServerSupabase();
  if (!supabase) return { ok: false, error: 'Sign-in is not configured yet.' };
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
```

- [ ] **Step 4: Fix the one consumer to stay green.** In `src/components/signin/SignInPanel.tsx`, change the import `sendMagicLink` → `requestEmailCode` and the call `await sendMagicLink(email)` → `await requestEmailCode(email)`. (The full two-step rewrite is Task 3; this keeps the tree compiling now.) Update `tests/unit/components/signin/SignInPanel.test.tsx` mock: `vi.mock('@/lib/auth/actions', () => ({ requestEmailCode: vi.fn(), verifyEmailCode: vi.fn(), startGitHubOAuth: vi.fn() }))` and rename the two `sendMagicLink` references to `requestEmailCode`.

- [ ] **Step 5: Run the affected suites to verify green.** Run: `node node_modules/vitest/vitest.mjs run tests/unit/lib/auth/actions.test.ts tests/unit/components/signin/SignInPanel.test.tsx` and `npx tsc --noEmit` — Expected: PASS, tsc clean.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/auth/actions.ts src/components/signin/SignInPanel.tsx tests/unit/lib/auth/actions.test.ts tests/unit/components/signin/SignInPanel.test.tsx
git commit -m "feat(auth): requestEmailCode replaces sendMagicLink (code flow)"
```

---

## Task 2: `verifyEmailCode` server action + `sanitizeNext`

**Files:**

- Modify: `src/lib/auth/actions.ts`
- Test: `tests/unit/lib/auth/actions.test.ts`

**Interfaces:**

- Produces: `verifyEmailCode(email: string, token: string, next?: string): Promise<AuthResult>`. Calls `supabase.auth.verifyOtp({ email, token, type: 'email' })`; on error, retries once with `type: 'signup'` (a brand-new account's first code is a signup OTP). On success, `redirect(sanitizeNext(next))` (redirect throws; success never returns a value). Returns `{ ok: false, error }` on failure; inert when unconfigured.
- Produces: `sanitizeNext(next?: string): string` (module-private) — returns `next` only if it is a same-site relative path (`/`-prefixed, not `//`, no backslash, no scheme), else `/account`.

- [ ] **Step 1: Write the failing tests (RED).** Append to `tests/unit/lib/auth/actions.test.ts`:

```ts
import { verifyEmailCode } from '@/lib/auth/actions';
import { redirect } from 'next/navigation';

const mockVerify = (verifyOtp: ReturnType<typeof vi.fn>) =>
  vi.mocked(createServerSupabase).mockResolvedValue({ auth: { verifyOtp } } as never);

describe('verifyEmailCode (email OTP verify)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is inert (ok:false) when auth is not configured', async () => {
    vi.mocked(createServerSupabase).mockResolvedValue(null);
    expect((await verifyEmailCode('a@b.com', '123456')).ok).toBe(false);
  });

  it('verifies with type email and redirects to a safe next (cookies set first)', async () => {
    const order: string[] = [];
    const verifyOtp = vi.fn(async () => {
      order.push('verify');
      return { error: null };
    });
    vi.mocked(redirect).mockImplementation(() => {
      order.push('redirect');
      return undefined as never;
    });
    mockVerify(verifyOtp);
    await verifyEmailCode('a@b.com', '123456', '/leaderboard');
    expect(verifyOtp).toHaveBeenCalledWith({ email: 'a@b.com', token: '123456', type: 'email' });
    expect(redirect).toHaveBeenCalledWith('/leaderboard');
    expect(order).toEqual(['verify', 'redirect']); // session write precedes redirect
  });

  it('falls back to type signup for a new-account code', async () => {
    const verifyOtp = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: 'otp_expired' } })
      .mockResolvedValueOnce({ error: null });
    mockVerify(verifyOtp);
    await verifyEmailCode('new@b.com', '654321');
    expect(verifyOtp).toHaveBeenNthCalledWith(2, {
      email: 'new@b.com',
      token: '654321',
      type: 'signup',
    });
    expect(redirect).toHaveBeenCalledWith('/account');
  });

  it('returns a typed error and does not redirect when both types fail', async () => {
    const verifyOtp = vi
      .fn()
      .mockResolvedValue({ error: { message: 'Token has expired or is invalid' } });
    mockVerify(verifyOtp);
    expect(await verifyEmailCode('a@b.com', '000000')).toEqual({
      ok: false,
      error: 'Token has expired or is invalid',
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([
    ['//evil.com', '/account'],
    ['https://evil.com', '/account'],
    ['javascript:alert(1)', '/account'],
    ['/leaderboard', '/leaderboard'],
    [undefined, '/account'],
  ])('sanitizes next=%s to %s', async (next, expected) => {
    const verifyOtp = vi.fn().mockResolvedValue({ error: null });
    mockVerify(verifyOtp);
    await verifyEmailCode('a@b.com', '123456', next as string | undefined);
    expect(redirect).toHaveBeenCalledWith(expected);
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `node node_modules/vitest/vitest.mjs run tests/unit/lib/auth/actions.test.ts` — Expected: FAIL (`verifyEmailCode` not exported).

- [ ] **Step 3: Implement (GREEN).** Add to `src/lib/auth/actions.ts`:

```ts
/** Same-site relative path only, else `/account` (open-redirect guard). `next`
 *  arrives from the untrusted `?next=` query param. */
function sanitizeNext(next?: string): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return '/account';
  }
  return next;
}

/**
 * Email OTP verify: exchange the typed 6-digit code for a session. Tries the
 * sign-in OTP type, then the signup OTP type (a brand-new account's first code).
 * On success the cookie-bound server client has set the session cookies, so we
 * redirect to a sanitized `next`. verifyOtp is the whole flow: no PKCE, no
 * callback, so an email scanner or a different browser can never break it.
 */
export async function verifyEmailCode(
  email: string,
  token: string,
  next?: string,
): Promise<AuthResult> {
  const supabase = await createServerSupabase();
  if (!supabase) return { ok: false, error: 'Sign-in is not configured yet.' };

  let { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) {
    ({ error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' }));
  }
  if (error) return { ok: false, error: error.message };

  redirect(sanitizeNext(next));
}
```

- [ ] **Step 4: Run to verify it passes.** Run: `node node_modules/vitest/vitest.mjs run tests/unit/lib/auth/actions.test.ts` and `npx tsc --noEmit` — Expected: PASS, tsc clean.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/auth/actions.ts tests/unit/lib/auth/actions.test.ts
git commit -m "feat(auth): verifyEmailCode with type fallback + next guard"
```

---

## Task 3: SignInPanel two-step UI (email → code)

**Files:**

- Modify: `src/components/signin/SignInPanel.tsx`
- Test: `tests/unit/components/signin/SignInPanel.test.tsx`

**Interfaces:**

- Consumes: `requestEmailCode`, `verifyEmailCode` (Tasks 1-2).
- Produces: `SignInPanel({ authEnabled?, githubEnabled?, linkError?, next? })` renders a `step` state machine: `'email'` (existing form, button "EMAIL ME A CODE") → on `requestEmailCode` ok → `'code'` (heading "Enter your code.", a 6-digit input, "VERIFY AND CONTINUE", a 45s-cooldown "Resend code", and "Use a different email"). Wrong code → `role="alert"`, stay on `'code'`. (The `linkError`→`authError` rename is Task 4.)

- [ ] **Step 1: Write the failing tests (RED).** Add to `tests/unit/components/signin/SignInPanel.test.tsx` (mocks already updated in Task 1):

```ts
import { requestEmailCode, verifyEmailCode } from '@/lib/auth/actions';

it('advances to the code step after a code is requested', async () => {
  vi.mocked(requestEmailCode).mockResolvedValue({ ok: true });
  const user = userEvent.setup();
  render(<SignInPanel authEnabled />);
  await user.type(screen.getByLabelText(/email/i), 'real@user.com');
  await user.click(screen.getByRole('button', { name: /email me a code/i }));
  expect(await screen.findByRole('heading', { name: /enter your code/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/code/i)).toHaveAttribute('inputmode', 'numeric');
  expect(screen.getByLabelText(/code/i)).toHaveAttribute('autocomplete', 'one-time-code');
});

it('surfaces a wrong-code error and stays on the code step', async () => {
  vi.mocked(requestEmailCode).mockResolvedValue({ ok: true });
  vi.mocked(verifyEmailCode).mockResolvedValue({ ok: false, error: 'That code is incorrect or has expired. Enter the latest one or resend a new code.' });
  const user = userEvent.setup();
  render(<SignInPanel authEnabled next="/account" />);
  await user.type(screen.getByLabelText(/email/i), 'real@user.com');
  await user.click(screen.getByRole('button', { name: /email me a code/i }));
  await user.type(await screen.findByLabelText(/code/i), '000000');
  await user.click(screen.getByRole('button', { name: /verify and continue/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect or has expired/i);
  expect(screen.getByRole('heading', { name: /enter your code/i })).toBeInTheDocument();
});

it('returns to the email step from the code step', async () => {
  vi.mocked(requestEmailCode).mockResolvedValue({ ok: true });
  const user = userEvent.setup();
  render(<SignInPanel authEnabled />);
  await user.type(screen.getByLabelText(/email/i), 'real@user.com');
  await user.click(screen.getByRole('button', { name: /email me a code/i }));
  await user.click(await screen.findByRole('button', { name: /use a different email/i }));
  expect(screen.getByRole('button', { name: /email me a code/i })).toBeInTheDocument();
});

it('disables resend during the cooldown then re-enables it', async () => {
  vi.useFakeTimers();
  try {
    vi.mocked(requestEmailCode).mockResolvedValue({ ok: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SignInPanel authEnabled />);
    await user.type(screen.getByLabelText(/email/i), 'real@user.com');
    await user.click(screen.getByRole('button', { name: /email me a code/i }));
    const resend = await screen.findByRole('button', { name: /resend code/i });
    expect(resend).toBeDisabled();
    await vi.advanceTimersByTimeAsync(45_000);
    expect(screen.getByRole('button', { name: /resend code/i })).toBeEnabled();
  } finally {
    vi.useRealTimers();
  }
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `node node_modules/vitest/vitest.mjs run tests/unit/components/signin/SignInPanel.test.tsx` — Expected: FAIL (no code step / heading not found).

- [ ] **Step 3: Implement the two-step panel (GREEN).** Rewrite the body of `SignInPanel` to a `step` state machine. Key points:
  - State: `const [step, setStep] = useState<'email' | 'code'>('email'); const [code, setCode] = useState(''); const [cooldown, setCooldown] = useState(0);`
  - Email submit handler: `requestEmailCode(email)`; on ok → `setStep('code'); setError(null); startCooldown();` else `setError(res.error)`. Preview path (`!authEnabled`) keeps the existing "That is the flow." preview (unchanged behavior).
  - Code submit handler: `startTransition(async () => { const res = await verifyEmailCode(email, code, next); if (!res.ok) setError(res.error); })` (success redirects server-side).
  - Cooldown: `startCooldown` sets `cooldown=45` and a `setInterval` decrementing each second to 0 (clear on unmount / on reaching 0); Resend button `disabled={cooldown > 0}`, label `cooldown > 0 ? \`Resend code in ${cooldown}s\` : 'Resend code'`, onClick calls the email submit handler again.
  - Code input: `<input id={codeId} inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]*" aria-describedby=... value={code} onChange=...>` with a mono `CODE` label; move focus to it on entering the code step (`useEffect` + ref).
  - "Use a different email" button: `setStep('email'); setCode(''); setError(null);`
  - Error render: the existing `{error && <p role="alert" ...>{error}</p>}` shown on both steps.
  - Copy (no em dashes): step-2 heading `Enter your code.`; body `We emailed a 6-digit code to {email}. It expires in 15 minutes. Enter it below to finish signing in.`; verify button `VERIFY AND CONTINUE` (pending `Verifying...`); request button `EMAIL ME A CODE`.
  - Accept the new `next?: string` prop (default undefined) and pass it to `verifyEmailCode`.

- [ ] **Step 4: Run to verify it passes.** Run: `node node_modules/vitest/vitest.mjs run tests/unit/components/signin/SignInPanel.test.tsx` and `npx tsc --noEmit` — Expected: PASS, tsc clean.

- [ ] **Step 5: Commit.**

```bash
git add src/components/signin/SignInPanel.tsx tests/unit/components/signin/SignInPanel.test.tsx
git commit -m "feat(auth): two-step email OTP sign-in panel (email then code)"
```

---

## Task 4: OAuth-failure rename + `next` passthrough (panel + page)

**Files:**

- Modify: `src/components/signin/SignInPanel.tsx`
- Modify: `src/app/sign-in/page.tsx`
- Test: `tests/unit/components/signin/SignInPanel.test.tsx`, `tests/unit/app/signin.test.tsx`

**Interfaces:**

- Produces: `SignInPanel` prop `linkError` renamed to `authError` (same boolean); copy becomes sign-in-generic. Page passes `authError={ (await searchParams)?.error === 'auth' }` and `next={ (await searchParams)?.next }`.

- [ ] **Step 1: Update tests (RED).** In `tests/unit/components/signin/SignInPanel.test.tsx`, change the existing `linkError` test to use `authError` and assert generic copy:

```ts
it('surfaces a clear reason (not a blank form) on an OAuth sign-in failure', () => {
  render(<SignInPanel authEnabled authError />);
  expect(screen.getByRole('alert')).toHaveTextContent(/could not complete that sign-in/i);
  expect(screen.getByRole('button', { name: /email me a code/i })).toBeInTheDocument();
});
```

In `tests/unit/app/signin.test.tsx`, retarget the two error tests and add a `next` passthrough test:

```ts
it('explains a failed sign-in (?error=auth) instead of a blank form', async () => {
  render(await SignIn({ searchParams: Promise.resolve({ error: 'auth' }) }));
  expect(screen.getByRole('alert')).toHaveTextContent(/could not complete that sign-in/i);
});

it('shows no failure notice on a normal visit', async () => {
  render(await SignIn({ searchParams: Promise.resolve({}) }));
  expect(screen.queryByText(/could not complete that sign-in/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `node node_modules/vitest/vitest.mjs run tests/unit/components/signin/SignInPanel.test.tsx tests/unit/app/signin.test.tsx` — Expected: FAIL (`authError` unknown / copy mismatch).

- [ ] **Step 3: Implement (GREEN).**
  - In `SignInPanel.tsx`: rename the prop `linkError` → `authError` (and its JSDoc). Change the alert copy to: `We could not complete that sign-in. Request a new code below.` Keep the caution styling + `role="alert"` + `CautionIcon`.
  - In `src/app/sign-in/page.tsx`: widen the searchParams type to `{ error?: string; next?: string }`; compute `const sp = (await searchParams) ?? {};` then pass `authError={sp.error === 'auth'}` and `next={sp.next}` to `SignInPanel` (drop the old `linkError`).

- [ ] **Step 4: Run to verify it passes.** Run: `node node_modules/vitest/vitest.mjs run tests/unit/components/signin/SignInPanel.test.tsx tests/unit/app/signin.test.tsx` and `npx tsc --noEmit` — Expected: PASS, tsc clean.

- [ ] **Step 5: Commit.**

```bash
git add src/components/signin/SignInPanel.tsx src/app/sign-in/page.tsx tests/unit/components/signin/SignInPanel.test.tsx tests/unit/app/signin.test.tsx
git commit -m "feat(auth): generic sign-in-failure notice + next passthrough"
```

---

## Task 5: Full gate, design critique, PR, merge, plan.md

**Files:**

- Modify: `plan.md` (mark magic-link bug resolved + Slice 1.5 done)
- No source changes beyond dispositioned critique fixes.

- [ ] **Step 1: Full local gate.** Run: `npx tsc --noEmit`, `node node_modules/vitest/vitest.mjs run` (all pass, coverage above thresholds), `npx impeccable detect src/` (clean). Expected: all green.

- [ ] **Step 2: Design critique (locked, do not skip).** Run `/impeccable critique` on `src/components/signin/SignInPanel.tsx` (the two-step flow + code entry + resend + error states). Record each finding and its disposition (kept-with-reason or accepted-as-change) in the PR body. Apply any accepted P0/P1 fixes and re-run Step 1.

- [ ] **Step 3: Update plan.md.** In `plan.md` "Current status", note: the magic-link bug is resolved (PRs #73/#74/#75) and Slice 1.5 replaced magic-link verification with code-only Email OTP (this PR); GitHub OAuth still uses `/auth/callback`. Keep it truthful and dated 2026-07-25.

- [ ] **Step 4: Branch, commit, push, PR (draft).** Branch `feat/email-otp-signin` off `origin/main`; the Task 1-4 commits ride here; add the plan.md commit. Push (pre-push typecheck runs). Open a draft PR to `main` via the PowerShell/Invoke-RestMethod egress path (curl to GitHub is sandbox-blocked; PR body ASCII-only, no Claude attribution).

- [ ] **Step 5: CI green → mark ready → squash-merge.** Poll check-runs for the head SHA; when Build & Test + CI Gate are green, mark ready for review and squash-merge (linear history). Delete the branch; sync `main`.

---

## Task 6: PROD prerequisite + end-to-end verification (BLOCKING, with operator)

This task is not code; it gates "done". It must cover BOTH the signup (new user) and email (returning user) OTP paths — a returning-only pass is the exact gap that hid the magic-link bug.

- [ ] **Step 1: BLOCK on the template edit.** Tell the operator (loud, like the env vars) to edit BOTH **Authentication → Email Templates → Magic Link** and **Confirm signup** to emit `{{ .Token }}` and drop the link (exact HTML in the spec). Do not proceed until confirmed.

- [ ] **Step 2: Template self-check on a real send.** With the operator: submit the operator's email on prod `/sign-in`, then confirm the received email **contains a 6-digit code and NO clickable sign-in link**. If it still contains a link, the template edit did not take (wrong template or not saved) — fix before continuing.

- [ ] **Step 3: Confirm the fresh build serves the OTP UI.** After the Task 5 merge deploys, load prod `/sign-in`: the primary button reads "EMAIL ME A CODE" (not "...LINK"); submitting an email advances to the "Enter your code." step.

- [ ] **Step 4: Verify the RETURNING-user path headlessly.** Using `.env.local` creds via `node --env-file=.env.local` and the service-role admin client: for an existing throwaway user, `admin.generateLink({ type: 'magiclink', email })` → read `properties.email_otp`. In the browser, type that email on `/sign-in`, submit, then type the `email_otp` into the code field and Verify. Expect: lands authenticated on `/account` ("Your runs.", the user's email, SIGN OUT).

- [ ] **Step 5: Verify the NEW-user path headlessly.** For a brand-new throwaway email, `admin.generateLink({ type: 'signup', email })` → read `properties.email_otp`. Drive the same two-step UI with that code. Expect: authenticated `/account`. (This exercises the `type: 'signup'` fallback in `verifyEmailCode`.) BOTH Step 4 and Step 5 must pass, or the slice is not verified.

- [ ] **Step 6: Negative + regression checks.** A wrong code shows the inline `role="alert"` and stays on the code step. Sign-out clears the session (`/account` → `/sign-in`). Public routes still open; GitHub button still inert behind config.

- [ ] **Step 7: Clean up.** Delete the throwaway users via `admin.auth.admin.deleteUser` (cascades their rows). Leave the operator's own account.

- [ ] **Step 8: Report.** Summarize: template confirmed (code, no link), returning-user PASS, new-user PASS, negative + regressions PASS, cleanup done. Only then is Slice 1.5 done.

---

## Self-Review

- **Spec coverage:** code-only OTP (Tasks 1-3), `/auth/callback` kept for OAuth (untouched; Task 4 copy only), rename `sendMagicLink`→`requestEmailCode` (Task 1), resend 45s + use-different-email (Task 3), a11y role/inputmode/autocomplete/keyboard + `/impeccable critique` (Task 3 + Task 5 Step 2), server-action cookie-before-redirect proven (Task 2 order test + Task 6 e2e), open-redirect guard (Task 2), both signup+email paths verified on prod (Task 6 Steps 4-5), two-template BLOCKING prerequisite + real-send self-check (Task 6 Steps 1-2), no em dashes (Global Constraints + Task 3 copy). All covered.
- **Placeholder scan:** none; every code step has concrete code.
- **Type consistency:** `AuthResult` reused; `requestEmailCode(email)`, `verifyEmailCode(email, token, next?)`, `sanitizeNext(next?)`, `SignInPanel({ authEnabled?, githubEnabled?, authError?, next? })` consistent across tasks.
- **Note on double-verify:** Task 2's `signup` fallback issues a second `verifyOtp` only after the first errored; validated end-to-end in Task 6 (new-user path). If prod shows the first (`email`) attempt consumes a signup token before the fallback, narrow the retry to the specific error and re-verify.
