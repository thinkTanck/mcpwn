import type { Metadata } from 'next';
import { ConnectScreen } from '@/components/connect/ConnectScreen';

export const metadata: Metadata = {
  title: 'Connect / Run Setup · MCPwn',
  description:
    'Set up a red-team run: play a no-key sample or connect your own MCP agent for a live run. The detector is fixed, blind, and locked.',
};

/**
 * Connect / Run Setup route. The interactive console (mode switch, category
 * checklist, BYOK form, sign-in gate) is a Client Component; sign-in state will
 * be threaded in from Supabase Auth once live-run gating is wired.
 */
export default function ConnectPage() {
  return <ConnectScreen />;
}
