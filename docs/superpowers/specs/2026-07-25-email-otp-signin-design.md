# Email OTP sign-in (Slice 1.5) — design spec

**Status:** approved for spec review (2026-07-25). Supersedes the magic-link _verification_ path; the magic-link bug itself is resolved (PRs #73/#74/#75).

## Why

The magic-link human path works on a clean click, but the failure class is inherent to one-time _links_: a corporate email security scanner (SafeLinks / Proofpoint / Mimecast) pre-fetches the URL and spends the one-time token before the user clicks, and a link opened in a different browser than it was requested from has no PKCE verifier. MCPwn's likely reviewers are security practitioners on exactly those inboxes. Email OTP (a 6-digit code the user types) removes the class: the code is verified in the same browser it is typed into, and there is no URL for a scanner to spend.

**Chosen shape (locked):** code-only. The email carries only the 6-digit code, no clickable verify link. A link and a typed code share the same one-time token, so keeping a link would let a scanner consume it and break the typed code too. Code-only is the only shape that fully closes the class.

## Goals

- Replace the email **magic-link verification** with a two-step **email OTP** flow: request code, then type code.
- Keep GitHub OAuth working unchanged (it still uses `/auth/callback` + PKCE).
- Accessible, keyboard-operable, on-brand; no regressions to the offline-safe / auth-inert behavior.
- Fully prod-verifiable without an inbox.

## Non-goals

- No change to persistence, RLS, `/account`, or the run pipeline.
- No change to GitHub/Google OAuth wiring (GitHub stays behind config; Google stays disabled).
- Not Slice 2 (the live judge). Out of scope.

## HARD PREREQUISITE (yours, in Supabase — loud, like the env vars)

`signInWithOtp` sends its email using Supabase's **email templates**, which default to a clickable link. For a code-only flow the template must emit `{{ .Token }}` and **drop the link**. This is a Supabase Dashboard change only you can make; without it the email still sends a link and the flow cannot work.

- Where: **Supabase Dashboard → Authentication → Email Templates**.
- Update **BOTH** templates, because `signInWithOtp({ shouldCreateUser: true })` uses **Confirm signup** for a brand-new email and **Magic Link** for a returning user:
  - **Magic Link** template body:
    ```html
    <h2>Your MCPwn sign-in code</h2>
    <p>Enter this code to finish signing in. It expires in 15 minutes.</p>
    <p style="font-size:24px;font-weight:700;letter-spacing:3px">{{ .Token }}</p>
    <p>If you did not request this, you can ignore this email.</p>
    ```
  - **Confirm signup** template body: same as above (the `{{ .Token }}` is the 6-digit code for a new account).
- We verify the live template together on prod before calling the slice done (see Verification).

## Architecture and flow

Two steps, one browser throughout. No `/auth/callback`, no PKCE, no URL, for the email path.

1. **Request code.** `SignInPanel` step 1 (email) submits to a `requestEmailCode(email)` server action → `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`. Returns a typed `AuthResult`. On `ok`, the panel advances to step 2; on error (rate limit, invalid email), inline `role="alert"`.
2. **Verify code.** `SignInPanel` step 2 (6-digit code) submits to `verifyEmailCode(email, token, next)` server action → `supabase.auth.verifyOtp({ email, token, type: 'email' })`. On success the cookie-bound SSR server client sets the session cookies and the action `redirect(next ?? '/account')`. On failure, typed inline error + a Resend action.

**Verify-type edge case (must test both):** a returning user's OTP verifies with `type: 'email'`; a brand-new user's first code may be a signup OTP. The action attempts `type: 'email'` and, on an `otp_expired`/type-mismatch class error, retries once with `type: 'signup'` before surfacing the error. Both the new-user and returning-user paths are exercised in prod via the `email_otp` trick below.

**GitHub OAuth unchanged.** `startGitHubOAuth` still redirects to GitHub → `/auth/callback?code=...` → `exchangeCodeForSession`. The `/auth/callback` route stays exactly as-is. Its `?error=auth` bounce (PR #75) remains the OAuth-failure surface; its copy is changed from link-specific to sign-in-generic (see Copy).

## Components and files

- **`src/lib/auth/actions.ts`**
  - Remove `sendMagicLink`; add `requestEmailCode(email): Promise<AuthResult>` (same body: `signInWithOtp`, no `emailRedirectTo` needed for the code path).
  - Add `verifyEmailCode(email, token, next?): Promise<AuthResult>` — `verifyOtp` with the type handling above; on success `redirect(safeNext)` (redirect throws, so the caller never sees `ok:true`); typed error otherwise.
  - **Open-redirect guard:** `next` is sanitized to a same-site relative path — it must start with a single `/` and not `//` (protocol-relative) or contain a scheme; anything else falls back to `/account`. `next` flows from `?next=` on the sign-in URL, so it is untrusted.
  - Keep `startGitHubOAuth`, `signOut`, `siteOrigin`.
- **`src/components/signin/SignInPanel.tsx`** — a two-step client component:
  - **Step "email":** the current email form, button relabeled "EMAIL ME A CODE".
  - **Step "code":** heading + explanatory line naming the address; a single code input (`inputMode="numeric"`, `autoComplete="one-time-code"`, `maxLength={6}`, `pattern="[0-9]*"`, labelled); a "VERIFY AND CONTINUE" button (pending state); a **Resend code** control with a 45s cooldown (disabled + counting down, `aria-live` on the countdown); a "Use a different email" control that returns to step "email"; inline `role="alert"` for a wrong/expired code.
  - Reuse the existing `linkError`/OAuth-error surface; rename the prop to `authError` and make the copy sign-in-generic.
  - Preserve the auth-inert **preview** state (unchanged) when `authEnabled` is false.
- **`src/app/sign-in/page.tsx`** — already async + reads `searchParams`; also read `next` and pass it through to `SignInPanel` so `verifyEmailCode` can honor it.

## Session and data flow

`verifyOtp` on the server sets the session cookies through the same cookie-bound `createServerSupabase` client the callback uses (`setAll` → `next/headers` cookies). The server action then `redirect(next)`. **Risk to prove, not assume:** that cookies written inside a server action persist across the action's `redirect` (the callback route proved this for `exchangeCodeForSession`; server actions can set cookies, but it is a different execution context). Proven by a unit test on the action (cookies set before redirect) and by the prod end-to-end check.

## Copy (no em dashes)

- Step 2 heading: `Enter your code.`
- Step 2 body: `We emailed a 6-digit code to {email}. It expires in 15 minutes. Enter it below to finish signing in.`
- Code field label: `CODE`
- Verify button: `VERIFY AND CONTINUE` (pending: `Verifying...`)
- Resend: `Resend code` / cooldown `Resend code in {n}s`
- Return control: `Use a different email`
- Wrong code error: `That code is incorrect or has expired. Enter the latest one or resend a new code.`
- Request-code button (step 1): `EMAIL ME A CODE`
- OAuth failure (`?error=auth`, generic now that links are gone): `We could not complete that sign-in. Request a new code below.`

## Accessibility (locked)

- Inline errors use `role="alert"`.
- Code input: `inputMode="numeric"`, `autoComplete="one-time-code"`, an associated `<label>`, visible focus.
- Fully keyboard-operable: email → submit → code → verify → resend/back, all reachable and operable by keyboard; focus moves to the code input on step change.
- WCAG 2.2 AA contrast; state conveyed by text + icon, never color alone.
- **Run `/impeccable critique` on `SignInPanel` after implementation (do not skip — it is a UI change), dispositions recorded in the PR.**

## Testing (TDD, RED first)

Unit (Vitest + Testing Library, mocked Supabase):

- `requestEmailCode` calls `signInWithOtp({ email, ... })`; returns `ok` / typed error.
- `verifyEmailCode`: valid code → `verifyOtp` called, cookies set, `redirect(next)`; invalid → typed error, no redirect; new-user path → falls back to `type: 'signup'`.
- `verifyEmailCode` cookie-before-redirect: assert the session `setAll` runs before the redirect (the server-action cookie behavior).
- `verifyEmailCode` open-redirect guard: `next="//evil.com"`, `next="https://evil.com"`, and `next="javascript:..."` all fall back to `/account`; `next="/leaderboard"` is honored.
- `SignInPanel`: step transition email→code on send; verify success path (mocked); wrong-code error surface; resend cooldown disables then re-enables; "use a different email" returns to step 1; preview state intact when `authEnabled` is false; `authError` surface renders.
- `sign-in/page`: passes `next` and `authError` through.
- Callback tests unchanged (OAuth path untouched).
- Coverage stays above the CI thresholds; `detect` clean.

## Verification (prod, no inbox needed)

`admin.generateLink({ type: 'magiclink' | 'signup', email })` returns `properties.email_otp` (the 6-digit code). So end to end on prod:

1. Confirm the live email template emits the code (send one to the operator address once, together).
2. Throwaway user: drive the **real two-step UI** — type the email, then paste the `email_otp` from `generateLink` into the code field, and confirm it lands authenticated on `/account`; test both a brand-new email (signup OTP) and a returning one (email OTP).
3. Confirm a wrong code shows the inline error and stays on step 2.
4. Confirm sign-out clears the session; confirm public routes and GitHub-inert are unaffected.
5. Clean up throwaway users.

## Rollout and risks

- One PR (its own slice), squash-merged to protected `main`; fresh prod build; then the prod verification above with the operator.
- Risk: the email-template prerequisite is not applied → the flow cannot work. Mitigation: flagged loudly here and verified on prod together before sign-off.
- Risk: server-action cookie-across-redirect → proven by test + prod check, not assumed.
- Risk: new-user vs returning-user verify type → handled with the `email`→`signup` fallback and both paths verified.
- Attribution: `thinkTanck` only. No em dashes in UI copy. Repo stays private.

## Out of scope / next

Slice 2 (live validated judge) is not started; it needs the Anthropic judge key and the variant-count prerequisite, scoped separately.

---

## CORRECTION (2026-07-27) — two assumptions in this spec were wrong on prod

This spec shipped, and sign-in did not work: every fresh emailed code failed with
`Token has expired or is invalid`. Root-caused against a real `signInWithOtp`
send by reading GoTrue's own `auth.one_time_tokens` and `auth.users`. Two
independent defects, either of which alone breaks the flow.

**1. "No PKCE for the email path" was not true of the client we used.** The spec
says "no `/auth/callback`, no PKCE, no URL, for the email path", which is right
about the _protocol_ and wrong about the _client_. `@supabase/ssr`'s
`createServerClient` sets `flowType: "pkce"` **after** spreading the caller's
`auth` options, so PKCE cannot be turned off there. auth-js then attaches a
`code_challenge` to `signInWithOtp`, and GoTrue stores a flow-state auth code
(observed: `recovery_token = pkce_97be793b…`) **instead of**
`sha224(email + otp)`. The emailed `{{ .Token }}` has nothing to match.
Fix: send through a session-less implicit-flow client
(`createOtpSenderSupabase`). Verify keeps the cookie-bound client, which has no
PKCE branch, so GitHub OAuth is unaffected.

**2. "6-digit code" is a project setting, not a constant.** Supabase's Email OTP
length is configurable from 6 to 10; this project emits **8**. Every
"6-digit" mention in this spec, and the `maxLength={6}` plus `.slice(0, 6)` it
produced, truncated the real code to a prefix. Fix: accept the full 6-to-10
range and let GoTrue be the authority. The copy no longer states a digit count,
nor the "15 minutes" expiry (also a dashboard setting the app cannot read).

**3. The verification method in this spec is what hid both defects.**
`admin.generateLink` is a service-role admin call: it bypasses the PKCE branch
entirely (storing `sha224(email+otp)`) and hands back `properties.email_otp`
directly, and pasting that value programmatically skips the length-capped input.
It exercised neither failing path while appearing to prove the flow.

> **Lesson for future verification plans:** a harness that constructs its own
> token does not test the token the user actually receives. Verify against the
> real send path, and drive it through the real input.

Also fixed: a failed request-code rendered a raw `{}`, because auth-js
`_getErrorMessage` ends in `JSON.stringify(err)` for a GoTrue error body
carrying none of `msg`/`message`/`error_description`/`error`. Provider errors are
now mapped to sentences by `src/lib/auth/errors.ts`.

**Still owed before this slice is DONE:** one operator smoke test on prod after
deploy — request a code on `mcpwn.dev`, type the code from the inbox, land on
`/account`. The fix is proven at the protocol level against the live project,
but no one has yet typed an inbox-delivered code into the deployed build.
