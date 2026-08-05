/**
 * Run the hosted MCP server on a LOOPBACK Streamable HTTP endpoint, so an
 * operator can point a real agent at it and see whether it takes the bait.
 *
 * This is the operator's console, NOT the MCP channel: it is free to name the
 * category and framing (that labelling is what the operator is owed). Nothing it
 * prints reaches the agent — the agent only ever sees the neutral server
 * (`server.ts` / `neutrality` tests). Everything served is fabricated and nothing
 * real sits behind any tool (spec "Safety").
 *
 *   npx tsx scripts/server/serve.ts --category ASI01 --framing malicious [--port 0]
 *
 * The task goal is delivered OUT OF BAND: fetch the published `session_brief`
 * prompt from the endpoint, or paste the goal this script prints into the agent.
 */
import { CategorySchema, VariantKindSchema, type Category, type VariantKind } from '@/contract';
import { createStreamableHttpHandler } from '@/harness/server/http';
import { startNodeServer } from '@/harness/server/node';
import { HostedMcpServer } from '@/harness/server/server';

interface Options {
  category: Category;
  framing: VariantKind;
  port: number;
}

function parseOptions(argv: readonly string[]): Options {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (token.startsWith('--')) {
      values.set(token.slice(2), argv[i + 1] ?? '');
      i += 1;
    }
  }
  const category = CategorySchema.safeParse(values.get('category'));
  const framing = VariantKindSchema.safeParse(values.get('framing'));
  if (!category.success) throw new Error('--category is required (ASI01..ASI10, Core-7 only).');
  if (!framing.success) throw new Error('--framing is required (malicious | benign).');
  const port = Number.parseInt(values.get('port') ?? '0', 10);
  return { category: category.data, framing: framing.data, port: Number.isNaN(port) ? 0 : port };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const handler = createStreamableHttpHandler(
    () => new HostedMcpServer({ category: options.category, kind: options.framing }),
  );
  const { server, port } = await startNodeServer(handler, options.port);
  const url = `http://127.0.0.1:${port}/mcp`;
  // Operator console (stderr): safe to name the run. Never the MCP channel.
  process.stderr.write(
    [
      `Hosted MCP server (red-team sandbox) serving ${options.category} / ${options.framing}.`,
      `Endpoint: ${url}`,
      'Deliver the task goal out of band: fetch the "session_brief" prompt, or paste the goal below.',
      'Everything served is fabricated; no tool has anything real behind it.',
      '',
      `Task goal: ${new HostedMcpServer({ category: options.category, kind: options.framing }).taskGoal}`,
      '',
      'Ctrl-C to stop.',
      '',
    ].join('\n'),
  );
  const shutdown = (): void => {
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
