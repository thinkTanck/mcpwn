import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

/**
 * `display: 'swap'` with next/font's metric-matched fallback: text paints
 * immediately in the size-adjusted fallback (fonts also arrive in ~85ms), so the
 * web font never gates first paint. Paired with the server-rendered shell, the
 * LCP content isn't blocked on hydration either.
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
