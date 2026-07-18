import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

/**
 * `display: 'optional'` with next/font's metric-matched fallback: text paints
 * immediately in the size-adjusted fallback, and the web font is only swapped in
 * if it arrives inside a short block window (otherwise it loads to cache for the
 * next navigation). This removes the FOUT reflow that `swap` causes: under CWV
 * throttling, swapping Geist into wrapping prose changed line counts and shifted
 * everything below (a ~0.2 CLS). The fallback is metric-matched, so the type
 * scale and measures are preserved; only the exact glyph shapes differ until the
 * cached font is used. CLS from fonts is then ~0 across every screen.
 */
const geistSans = Geist({ subsets: ['latin'], display: 'optional', variable: '--font-geist-sans' });
const geistMono = Geist_Mono({
  subsets: ['latin'],
  display: 'optional',
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
