export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--accent)]">
        OWASP Agentic Top 10 · 2026
      </p>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">MCPwn</h1>
      <p className="text-lg text-[var(--muted)]">
        Red-team an MCP-tool-using AI agent against the OWASP Top 10 for Agentic Applications. Watch
        attacks replay step by step, compare per-model robustness, and export engineer-ready fix
        reports.
      </p>
      <p
        className="font-mono text-sm text-[var(--muted)]"
        aria-label="System status: CI-first skeleton online"
      >
        <span aria-hidden="true">▸ </span>
        status: <span className="text-[var(--accent)]">ci-first skeleton — online</span>
      </p>
    </main>
  );
}
