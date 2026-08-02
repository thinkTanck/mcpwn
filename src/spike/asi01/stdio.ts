/**
 * HYPOTHESIS SPIKE — stdio transport.
 *
 * MCP over stdio is newline-delimited JSON: one JSON-RPC message per line, UTF-8,
 * no embedded newlines. The spike uses stdio and nothing else — no HTTP, no TLS,
 * no per-run token — because those are real PRODUCTION concerns that bear
 * nothing on the behavioral question ("does a real agent take the bait"). The
 * honest cost of that choice: this proves nothing about the hosted-HTTP-endpoint-
 * plus-token path, which stays a separate, unretired risk.
 *
 * TWO CHANNELS, never crossed. The MCP channel (stdout in production) carries
 * JSON-RPC only — a stray log line there corrupts the stream the client is
 * parsing. The run log goes to the side channel (stderr, or a file).
 *
 * The streams are injected, so the whole loop is exercised in-memory by a
 * loopback client under test with no process involved.
 */
import type { Trace } from '@/contract';
import { RPC_PARSE_ERROR, jsonRpcError } from '@/spike/asi01/protocol';
import type { SpikeMcpServer } from '@/spike/asi01/server';

export interface SpikeStdio {
  /** Inbound frames from the client (process stdin, or an in-memory stream). */
  readonly input: AsyncIterable<string | Uint8Array>;
  /** Write one framed line to the MCP channel. JSON-RPC ONLY. */
  write(line: string): void | Promise<void>;
  /** Write one line to the run log — the side channel, never the MCP channel. */
  logLine(line: string): void;
}

function decode(chunk: string | Uint8Array, decoder: TextDecoder): string {
  return typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
}

/**
 * Serve one MCP session over the given streams and return the recorded `Trace`
 * when the input ends.
 *
 * Session end is where `task_complete` is INFERRED — MCP has no agent-finished
 * message, so a closed stream is the only signal there is, and the step says so
 * in its own text.
 */
export async function serveStdio(server: SpikeMcpServer, io: SpikeStdio): Promise<Trace> {
  const decoder = new TextDecoder();
  let buffer = '';

  const handleLine = async (raw: string): Promise<void> => {
    const text = raw.trim();
    if (text === '') return; // framing artefact, not a message

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Unparseable input must not end the session: a crash here would look
      // exactly like an agent that declined to act.
      io.logLine(`in  <unparseable ${text.length} bytes>`);
      await io.write(`${JSON.stringify(jsonRpcError(null, RPC_PARSE_ERROR, 'Parse error'))}\n`);
      return;
    }

    const response = server.handle(parsed);
    const entry = server.log.at(-1);
    io.logLine(`in  ${entry ? JSON.stringify(entry) : text}`);
    if (response !== null) {
      await io.write(`${JSON.stringify(response)}\n`);
    }
  };

  for await (const chunk of io.input) {
    buffer += decode(chunk, decoder);
    for (;;) {
      const newline = buffer.indexOf('\n');
      if (newline === -1) break;
      const raw = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      await handleLine(raw);
    }
  }
  // A final line with no trailing newline is still a message.
  await handleLine(buffer);

  return server.buildTrace();
}
