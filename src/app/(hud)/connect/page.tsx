import type { Metadata } from 'next';
import { ConnectScreen } from '@/components/connect/ConnectScreen';
import { getUser } from '@/lib/auth/user';

export const metadata: Metadata = {
  title: 'Connect / Run Setup · MCPwn',
  description:
    'Set up a red-team run: play a no-key sample, or point your own MCP agent at our endpoint for a live run. The detector is fixed, blind, and locked.',
};

/**
 * Connect / Run Setup route. The interactive console (mode switch, category
 * checklist, sign-in gate) is a Client Component, so the server resolves the one
 * thing it cannot know on its own: the REAL session.
 *
 * This fixes a live bug — the screen previously rendered with no props at all, so
 * `signedIn` defaulted to false and the sign-in gate showed to people who were
 * already signed in.
 *
 * The live path itself is NOT wired here. Under
 * [ADR-0006](../../../../docs/adr/0006-mcpwn-is-the-mcp-server.md) a live run
 * means the user's agent connecting to an MCP server WE host, and that server
 * does not exist yet.
 */
export default async function ConnectPage() {
  const user = await getUser();

  return <ConnectScreen signedIn={user !== null} />;
}
