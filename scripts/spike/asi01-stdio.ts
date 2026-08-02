/**
 * HYPOTHESIS SPIKE — the entry point an MCP client launches.
 *
 * A local, sandboxed stdio MCP server serving ONE ASI01 tool surface. It is not
 * part of the deployed app, it listens on no port, it holds no credential, and
 * every tool behind it is a no-op over fabricated content.
 *
 * All logic lives in `src/spike/asi01/**` and is unit-tested there; this file is
 * only process wiring — argv in, streams bound, artefacts written.
 *
 * TWO CHANNELS: stdout is the MCP channel and carries JSON-RPC only. The run log
 * goes to stderr (or `--log <path>`). Writing anything else to stdout corrupts
 * the stream the client is parsing.
 *
 * Run it with (see docs/superpowers/specs/2026-08-01-hypothesis-spike-runbook.md):
 *   node --experimental-transform-types \
 *        --import ./scripts/spike/register-ts-alias.mjs \
 *        scripts/spike/asi01-stdio.ts --framing malicious
 */
import { createWriteStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { SPIKE_USAGE, SpikeOptionsError, parseSpikeOptions } from '@/spike/asi01/options';
import { SpikeMcpServer } from '@/spike/asi01/server';
import { serveStdio } from '@/spike/asi01/stdio';
import { buildSurface } from '@/spike/asi01/surface';

async function main(): Promise<number> {
  const options = parseSpikeOptions(process.argv.slice(2));

  if (options.printGoal) {
    // The task goal is delivered OUT OF BAND — by paste, for the spike. MCP has
    // no server-to-agent "here is your goal" message.
    process.stdout.write(`${buildSurface(options.framing).taskGoal}\n`);
    return 0;
  }

  const server = new SpikeMcpServer({
    kind: options.framing,
    ...(options.model === undefined ? {} : { model: options.model }),
    ...(options.runId === undefined ? {} : { runId: options.runId }),
  });

  const logSink =
    options.logPath === undefined ? null : createWriteStream(options.logPath, { flags: 'a' });
  const log = (line: string): void => {
    if (logSink) logSink.write(`${line}\n`);
    else process.stderr.write(`${line}\n`);
  };

  log(`# MCPwn red-team SANDBOX. Fabricated content only; no tool has anything real behind it.`);

  const trace = await serveStdio(server, {
    input: process.stdin,
    write: (line) => {
      process.stdout.write(line);
    },
    logLine: log,
  });

  await writeFile(options.tracePath, `${JSON.stringify(trace, null, 2)}\n`, 'utf8');
  log(`# session ended; recorded ${trace.steps.length} steps to ${options.tracePath}`);
  logSink?.end();
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    if (error instanceof SpikeOptionsError) {
      process.stderr.write(`${error.message}\n`);
    } else {
      process.stderr.write(
        `${error instanceof Error ? error.stack : String(error)}\n\n${SPIKE_USAGE}\n`,
      );
    }
    process.exitCode = 1;
  });
