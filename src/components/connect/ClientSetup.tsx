'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { CopyOut } from './CopyOut';
import type { LiveRunTicketView } from './live-run-port';

/**
 * HOW TO ACTUALLY CONNECT — the missing half of the Connect screen.
 *
 * The console already issued a correct endpoint, a correct token and a correct
 * goal, and explained WHAT each one is and WHY it exists. The one action the user
 * has to perform was covered by a single sentence: "Send it as a bearer token on
 * the connection." That is accurate and useless. It names no transport, gives no
 * command for any client, and assumes the reader already knows how to register a
 * remote Streamable HTTP MCP server with an auth header. A first-time reader
 * pastes the URL into a client expecting stdio, gets a connection error, and the
 * screen has nothing to say about it.
 *
 * ── THE FOUR RULES THIS SECTION IS BUILT AROUND ──
 *
 * 1. A REAL COMMAND, NOT A DESCRIPTION OF ONE. Every snippet is built from the
 *    issued ticket, so it is the command for THIS run and not a template with
 *    placeholders to fill in.
 *
 * 2. CONFIDENCE IS NOT UNIFORM, AND THE COPY DOES NOT PRETEND IT IS. Claude Code
 *    has two forms: `add-json` in newer builds and `--transport http` in older
 *    ones. We cannot see which build the reader has, so we give both and say how
 *    to find out, rather than asserting one universal command that fails for half
 *    the readers.
 *
 * 3. THE TOKEN IS COPYABLE WITHOUT BEING VISIBLE. A working command has to carry
 *    the credential, and a credential rendered inside a code block undoes the
 *    masking on the token block three inches above it. So each snippet is BUILT
 *    TWICE from the same function: once with the real token (that string is only
 *    ever handed to the clipboard) and once with a constant mask (that string is
 *    the only one that reaches the DOM). It is deliberately not a find-and-replace
 *    over the real command: a replace that misses prints the credential, and a
 *    string built from a mask has never held it.
 *
 * 4. ISOLATION IS STATED FIRST, AND NO FLAG IS INVENTED. The tools this endpoint
 *    serves are hostile by design, so an agent that also holds live connectors
 *    for mail, files or a cloud account can carry an injected instruction out to
 *    a real system. There is no client flag that loads a single MCP server, so we
 *    do not offer one: the honest answers are the in-session `/mcp` toggle and a
 *    separate client profile. That is the highest-value sentence on the page and
 *    it sits above the commands, where it is read before anything is run.
 */

/**
 * The server id every snippet uses.
 *
 * NEUTRAL ON PURPOSE. The client namespaces the tools it registers with this id,
 * and the agent reads the namespaced names when it connects, so an id like
 * `mcpwn` or `red-team` hands the agent the answer before the run starts.
 */
export const NEUTRAL_SERVER_NAME = 'workspace';

/**
 * A constant stand-in for the credential inside a rendered snippet. Derived from
 * nothing, so it discloses nothing, not even the token's length.
 */
const TOKEN_MASK = '•'.repeat(16);

/** `claude mcp add-json` — the newer Claude Code form. */
export function addJsonCommand(endpoint: string, token: string): string {
  const config = JSON.stringify({
    type: 'http',
    url: endpoint,
    headers: { Authorization: `Bearer ${token}` },
  });
  return `claude mcp add-json ${NEUTRAL_SERVER_NAME} '${config}'`;
}

/** `claude mcp add --transport http` — the older Claude Code form. */
export function addTransportCommand(endpoint: string, token: string): string {
  return (
    `claude mcp add --transport http ${NEUTRAL_SERVER_NAME} ${endpoint} ` +
    `--header "Authorization: Bearer ${token}"`
  );
}

/** The `claude_desktop_config.json` entry. Remote HTTP is native; no bridge. */
export function desktopConfig(endpoint: string, token: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        [NEUTRAL_SERVER_NAME]: {
          url: endpoint,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  );
}

/** What every other client needs on every request. */
export function authorizationHeader(_endpoint: string, token: string): string {
  return `Authorization: Bearer ${token}`;
}

/** The swapped panel, named so each picker button can point at it. */
const PANEL_ID = 'connect-client-panel';

type ClientId = 'claude-code' | 'claude-desktop' | 'other';

const CLIENTS: [ClientId, string][] = [
  ['claude-code', 'CLAUDE CODE'],
  ['claude-desktop', 'CLAUDE DESKTOP'],
  ['other', 'ANY OTHER MCP CLIENT'],
];

const WarningIcon = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
    <path
      d="M7 1.5 13 12.5H1L7 1.5Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinejoin="round"
    />
    <path d="M7 5.6v3.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <circle cx="7" cy="10.6" r="0.75" fill="currentColor" />
  </svg>
);

/**
 * One snippet. `build` is called twice: once with the real token for the
 * clipboard, once with the mask for the screen. See rule 3 above.
 */
function Snippet({
  label,
  name,
  build,
  ticket,
}: {
  label: string;
  name: string;
  build: (endpoint: string, token: string) => string;
  ticket: LiveRunTicketView;
}) {
  return (
    <CopyOut
      label={label}
      name={name}
      tone="code"
      value={build(ticket.endpoint, ticket.token)}
      display={build(ticket.endpoint, TOKEN_MASK)}
    />
  );
}

export function ClientSetup({ ticket }: { ticket: LiveRunTicketView }) {
  const [client, setClient] = useState<ClientId>('claude-code');

  return (
    <section
      aria-labelledby="connect-client"
      className="flex flex-col gap-3 border-t border-line pt-6"
    >
      <h3 id="connect-client" className="reading-h3">
        Register the endpoint in your client.
      </h3>

      {/* THE HIGHEST-VALUE SENTENCE ON THE PAGE, above the commands rather than
          beside them. CAUTION amber, with an icon and a label, never colour
          alone: this is an elevated state, not a breach, so it is never red. */}
      <div className="rounded-lg border border-caution/40 bg-caution/5 px-4 py-3.5">
        <p className="micro-label flex items-center gap-2 text-caution">
          <WarningIcon />
          ATTACH NOTHING ELSE
        </p>
        <p className="reading mt-2 max-w-[68ch]">
          Connect an agent that has no other tools attached. A run here can carry an instruction
          aimed at whatever your agent can reach, so if the same agent is also holding a live
          connector for mail, files, a browser or a cloud account, an instruction it takes on this
          endpoint can reach the real thing.
        </p>
        <p className="reading mt-2 max-w-[68ch] text-ink-muted">
          There is no command-line flag that loads one server on its own. Switch the others off with{' '}
          <span className="readout">/mcp</span> inside the session, or connect from a separate
          client profile that holds only this endpoint.
        </p>
      </div>

      <p className="reading max-w-[68ch]">
        Each snippet below is built from the run you just issued and names the server{' '}
        <span className="readout">{NEUTRAL_SERVER_NAME}</span>. Keep that name neutral: your client
        namespaces the tools with it and your agent reads the name when it connects, so an id like
        mcpwn or red-team tells the agent it is being tested.
      </p>

      {/* A pressed-button group, not a tablist: it is the same control the MODE
          picker on this screen already uses, and one component vocabulary beats a
          roving-tabindex tablist for three buttons. `aria-controls` still names
          what each one changes, so a screen reader is told where the panel it
          just swapped actually is. */}
      <div className="flex flex-wrap gap-2.5" role="group" aria-label="MCP client">
        {CLIENTS.map(([id, label]) => {
          const active = client === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              aria-controls={PANEL_ID}
              onClick={() => setClient(id)}
              className={cn(
                'min-h-11 rounded-md border px-4 py-2.5 font-mono text-[13px] tracking-[0.08em] transition-colors',
                active
                  ? 'border-nominal bg-nominal/10 text-readout shadow-glow-nominal'
                  : 'border-line bg-transparent text-ink-muted hover:border-line-em hover:text-ink',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div id={PANEL_ID}>
        {client === 'claude-code' && <ClaudeCode ticket={ticket} />}
        {client === 'claude-desktop' && <ClaudeDesktop ticket={ticket} />}
        {client === 'other' && <OtherClient ticket={ticket} />}
      </div>

      <Verify />
    </section>
  );
}

// ── Claude Code: two forms, because there are two forms ──

function ClaudeCode({ ticket }: { ticket: LiveRunTicketView }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="reading max-w-[68ch]">
        Run <span className="readout">claude --version</span> first, because the command changed.{' '}
        <span className="readout">add-json</span> is the newer form and{' '}
        <span className="readout">--transport http</span> is the older one. If your build rejects
        one of them as an unknown command, use the other.
      </p>
      <Snippet
        label="NEWER BUILDS"
        name="Claude Code add-json command"
        build={addJsonCommand}
        ticket={ticket}
      />
      <Snippet
        label="OLDER BUILDS"
        name="Claude Code transport command"
        build={addTransportCommand}
        ticket={ticket}
      />
      <p className="reading max-w-[68ch] text-ink-muted">
        The header form echoes the token back in the confirmation your shell prints, so keep that
        output off a shared terminal and out of an issue report.
      </p>
    </div>
  );
}

// ── Claude Desktop: a config file, and no bridge ──

function ClaudeDesktop({ ticket }: { ticket: LiveRunTicketView }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="reading max-w-[68ch]">
        Claude Desktop reads its servers from{' '}
        <span className="readout">claude_desktop_config.json</span>. Add this entry and restart the
        app. It speaks to a remote HTTP server natively, so there is no bridge to install and
        nothing to run on your own machine.
      </p>
      <Snippet
        label="CONFIG FILE ENTRY"
        name="Claude Desktop configuration"
        build={desktopConfig}
        ticket={ticket}
      />
    </div>
  );
}

// ── Everything else: the protocol facts, stated plainly ──

function OtherClient({ ticket }: { ticket: LiveRunTicketView }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="reading max-w-[68ch]">
        Register a remote MCP server over Streamable HTTP at the run endpoint above, and send this
        header on every request it makes. There is no stdio command to run and no local process
        involved.
      </p>
      <Snippet
        label="REQUEST HEADER"
        name="authorization header"
        build={authorizationHeader}
        ticket={ticket}
      />
    </div>
  );
}

// ── Did it work? ──

/**
 * Deliberately UNFRAMED. Four stacked bordered boxes in one section is the
 * thin-border panel soup PRODUCT.md lists as an anti-reference, and of the four
 * this is the one with the weakest claim to a frame: the caution callout is a
 * warning and the snippets are copyable artifacts, while this is two closing
 * sentences. The micro-label carries the scan cue instead.
 */
function Verify() {
  return (
    <div className="mt-1">
      <p className="micro-label">CHECK IT TOOK</p>
      <p className="reading mt-2 max-w-[68ch]">
        In Claude Code, <span className="readout">claude mcp list</span> should show{' '}
        <span className="readout">{NEUTRAL_SERVER_NAME}</span> as connected. When it does not,{' '}
        <span className="readout">claude mcp get {NEUTRAL_SERVER_NAME}</span> prints the reason it
        gave.
      </p>
      <p className="reading mt-2 max-w-[68ch] text-ink-muted">
        In any client, the reading that settles it is the connection panel below. It stays on
        AWAITING AGENT until your agent really reaches this endpoint, and it moves to AGENT
        CONNECTED the first time it does.
      </p>
    </div>
  );
}
