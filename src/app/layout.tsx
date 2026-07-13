import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

/**
 * Fonts are tuned for the LCP budget. `display: 'optional'` + `preload: false`
 * paints text immediately in next/font's metric-matched fallback and does NOT
 * swap Geist in on the first (uncached) load — so a slow web-font fetch can't
 * re-time text LCP past the 2.5s budget. Geist upgrades on subsequent cached
 * loads. Paired with the server-rendered shell, LCP tracks the fast first paint.
 */
const geistSans = Geist({ subsets: ['latin'], display: 'swap', variable: '--font-geist-sans' });
const geistMono = Geist_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-geist-mono',
});

export const metadata: Metadata = {
  title: 'MCPwn — Red-team your MCP agents',
  description:
    'MCPwn red-teams an MCP-tool-using AI agent against the OWASP Top 10 for Agentic Applications (2026): live attack replay, per-model robustness leaderboard, and engineer-ready fix reports.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
