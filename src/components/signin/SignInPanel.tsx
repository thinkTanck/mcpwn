'use client';

import { useId, useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/hud';
import { sendMagicLink, startGitHubOAuth } from '@/lib/auth/actions';

/**
 * Magic-link sign-in (BRAND · pre-auth). No real auth wiring — Supabase Auth
 * lands in Phase 8. Submitting the form flips to an inline "check your email"
 * confirmation (announced via role="status") so the control has honest,
 * visible-system-status feedback without leaving the page.
 *
 * Register discipline (design-system §3.0): sentences a human reads use the
 * READING role (sans, ≥16px); machine labels/field glyphs use the INSTRUMENT
 * role (mono, 12–13px). The frozen prototype set the helper line in mono — that
 * is prose in an instrument role, corrected here to READING.
 */
function EnvelopeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2.6 4.4 8 8.6l5.4-4.2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className="mt-1 flex-none text-ink-faint"
    >
      <rect x="2.5" y="5" width="7" height="5" rx="1" stroke="currentColor" strokeWidth="1" />
      <path d="M4 5V3.6a2 2 0 0 1 4 0V5" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 1.3a6.7 6.7 0 0 0-2.1 13c.33.06.45-.14.45-.32v-1.1c-1.86.4-2.25-.9-2.25-.9-.3-.77-.74-.98-.74-.98-.6-.41.05-.4.05-.4.67.05 1.02.69 1.02.69.6 1.02 1.56.73 1.94.56.06-.43.23-.73.42-.9-1.48-.17-3.04-.74-3.04-3.3 0-.73.26-1.32.69-1.79-.07-.17-.3-.85.07-1.77 0 0 .56-.18 1.84.68a6.4 6.4 0 0 1 3.34 0c1.28-.86 1.84-.68 1.84-.68.37.92.14 1.6.07 1.77.43.47.69 1.06.69 1.79 0 2.57-1.56 3.13-3.05 3.3.24.2.45.61.45 1.24v1.83c0 .18.12.39.46.32A6.7 6.7 0 0 0 8 1.3z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M14.5 8.16c0-.46-.04-.9-.12-1.32H8v2.5h3.65a3.12 3.12 0 0 1-1.35 2.05v1.7h2.18c1.28-1.18 2.02-2.92 2.02-4.93z"
        fill="currentColor"
      />
      <path
        d="M8 15c1.83 0 3.36-.6 4.48-1.64l-2.18-1.7c-.6.4-1.38.65-2.3.65-1.77 0-3.27-1.2-3.8-2.8H1.94v1.76A6.75 6.75 0 0 0 8 15z"
        fill="currentColor"
        opacity="0.8"
      />
      <path
        d="M4.2 9.5A4.06 4.06 0 0 1 4.2 6.5V4.74H1.94a6.76 6.76 0 0 0 0 6.52z"
        fill="currentColor"
        opacity="0.55"
      />
      <path
        d="M8 3.9c1 0 1.9.34 2.6 1.02l1.94-1.94A6.73 6.73 0 0 0 1.94 4.74L4.2 6.5C4.73 4.9 6.23 3.9 8 3.9z"
        fill="currentColor"
      />
    </svg>
  );
}

export function SignInPanel({
  authEnabled = false,
  githubEnabled = false,
}: {
  /** Real Supabase magic-link is wired (else the honest preview state). */
  authEnabled?: boolean;
  /** GitHub OAuth is configured + enabled (else the button stays disabled). */
  githubEnabled?: boolean;
}) {
  const emailId = useId();
  const helpId = useId();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Honest preview when auth is not configured: no send happens.
    if (!authEnabled) {
      setSent(true);
      return;
    }
    startTransition(async () => {
      const res = await sendMagicLink(email);
      if (res.ok) setSent(true);
      else setError(res.error);
    });
  };

  if (sent) {
    return (
      <div className="w-full max-w-[380px]" role="status" aria-live="polite">
        <div className="border-t border-line pt-7">
          <span aria-hidden="true" className="mb-2 inline-flex text-nominal">
            <EnvelopeIcon />
          </span>
          <h1 className="reading-h1">{authEnabled ? 'Check your inbox.' : 'That is the flow.'}</h1>
          <p className="reading mt-3">
            {authEnabled ? (
              <>
                A one-time sign-in link is on its way to{' '}
                <span className="font-mono text-readout">{email || 'your inbox'}</span>. It expires
                in 15 minutes, so open it on this device to finish signing in.
              </>
            ) : (
              <>
                In the live app, a one-time sign-in link lands at{' '}
                <span className="font-mono text-readout">{email || 'your inbox'}</span> and expires
                in 15 minutes. No email is sent in this preview; sign-in wiring ships with the
                hosted release.
              </>
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          className="mt-6 w-full uppercase"
          onClick={() => {
            setSent(false);
            setEmail('');
          }}
        >
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[380px]">
      <div className="border-t border-line pt-7">
        <h1 className="reading-h1">Continue to MCPwn.</h1>
        <p className="reading mt-3">
          Sign-in gates live runs against your own agent, with a small free-run cap that keeps
          things fair and affordable. Sample playback stays open to everyone.
        </p>
      </div>

      {/* Honest preview state only when auth is NOT configured: the screen is
          labelled a preview rather than asserting a send that never happens. */}
      {!authEnabled && (
        <div className="mt-4 flex items-center gap-2.5 rounded-md border border-line-em bg-nominal/5 px-3 py-2.5">
          <span className="shrink-0 rounded border border-line-em px-1.5 py-0.5 font-mono text-[13px] uppercase tracking-[0.12em] text-nominal">
            Preview
          </span>
          <span className="reading text-[15px] text-ink-muted">
            Sign-in wiring ships with the hosted release; no email is sent yet.
          </span>
        </div>
      )}

      <form className="mt-6 flex flex-col gap-3" onSubmit={submit}>
        <div className="flex flex-col gap-2">
          <label
            htmlFor={emailId}
            className="font-mono text-[13px] uppercase tracking-[0.12em] text-ink-faint"
          >
            Email
          </label>
          <input
            id={emailId}
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            aria-describedby={helpId}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-line bg-base px-3 py-3 font-mono text-[14px] text-readout placeholder:text-ink-faint focus-visible:border-nominal"
          />
        </div>

        <Button
          type="submit"
          disabled={pending}
          className="w-full gap-2.5 uppercase tracking-[0.06em]"
        >
          <EnvelopeIcon />
          {pending ? 'Sending…' : 'Email me a sign-in link'}
        </Button>

        {error && (
          <p role="alert" className="reading text-[15px] text-breach-text">
            {error}
          </p>
        )}

        <p id={helpId} className="reading mt-1 flex items-start gap-2">
          <LockIcon />
          <span>
            No password. We email a one-time link that expires in 15 minutes, so nothing to remember
            and nothing to leak.
          </span>
        </p>
      </form>

      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <span className="font-mono text-[13px] uppercase tracking-[0.14em] text-ink-faint">
          Or continue with
        </span>
        <span className="h-px flex-1 bg-line" />
      </div>

      {/* GitHub is wired behind config: enabled only when isGithubOAuthEnabled, so
          it never blocks on the GitHub app creds. Google stays disabled (unwired)
          rather than a silent no-op. */}
      <div className="flex gap-2.5">
        {githubEnabled ? (
          <form action={startGitHubOAuth} className="flex-1">
            <Button
              variant="ghost"
              type="submit"
              aria-label="Continue with GitHub"
              className="w-full gap-2 border-line text-ink"
            >
              <GitHubIcon />
              GitHub
            </Button>
          </form>
        ) : (
          <Button
            variant="ghost"
            disabled
            aria-label="Continue with GitHub (available with the hosted release)"
            className="flex-1 gap-2 border-line text-ink"
          >
            <GitHubIcon />
            GitHub
          </Button>
        )}
        <Button
          variant="ghost"
          disabled
          aria-label="Continue with Google (available with the hosted release)"
          className="flex-1 gap-2 border-line text-ink"
        >
          <GoogleIcon />
          Google
        </Button>
      </div>

      {/* The copy promises the sample is open to everyone; give it a door. */}
      <p className="reading mt-6 text-[15px] text-ink-muted">
        Just exploring?{' '}
        <Link href="/runs/sample" className="text-nominal hover:underline">
          Watch the sample run
        </Link>
        , no sign-in needed.
      </p>
    </div>
  );
}
