import type { Metadata } from 'next';
import { ConnectScreen } from '@/components/connect/ConnectScreen';
import { getUser } from '@/lib/auth/user';
import { isLiveRunEnabled } from '@/live';
import { launchLiveRun } from './actions';

export const metadata: Metadata = {
  title: 'Connect / Run Setup · MCPwn',
  description:
    'Set up a red-team run: play a no-key sample or connect your own MCP agent for a live run. The detector is fixed, blind, and locked.',
};

/**
 * Connect / Run Setup route. The interactive console (mode switch, category
 * checklist, BYOK form, sign-in gate) is a Client Component; the server resolves
 * the three things it cannot know on its own:
 *
 *  - `signedIn` — the REAL session, so the sign-in gate stops showing to users
 *    who are already signed in (it previously defaulted to false for everyone).
 *  - `liveRunEnabled` — whether the LOCKED validated judge is connected, so the
 *    screen states plainly when a live run cannot complete yet.
 *  - `launchLiveRun` — the server action; every gate is re-enforced inside it.
 */
export default async function ConnectPage() {
  const user = await getUser();

  return (
    <ConnectScreen
      signedIn={user !== null}
      liveRunEnabled={isLiveRunEnabled()}
      launchLiveRun={launchLiveRun}
    />
  );
}
