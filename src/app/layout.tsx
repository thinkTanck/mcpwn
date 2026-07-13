import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

export const metadata: Metadata = {
  title: 'MCPwn — Red-team your MCP agents',
  description:
    'MCPwn red-teams an MCP-tool-using AI agent against the OWASP Top 10 for Agentic Applications (2026): live attack replay, per-model robustness leaderboard, and engineer-ready fix reports.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
