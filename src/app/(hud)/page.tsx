import { SectionLabel } from '@/components/hud';

/**
 * Home placeholder — the shell + a minimal hero so the route builds and the
 * command deck resolves. The full landing (measured-accuracy stat, sample
 * trailer, Core-5, CTAs) lands in feat/ui-home.
 */
export default function Home() {
  return (
    <div className="mx-auto max-w-[1180px] px-6 py-12">
      <SectionLabel>Bring your own MCP agent</SectionLabel>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-ink-hi">MCPwn</h1>
      <p className="mt-4 max-w-xl text-base text-ink">
        Live red-team your MCP agent against the OWASP Agentic Top-10, with a detector whose
        accuracy is measured. The full landing lands in the next increment.
      </p>
    </div>
  );
}
