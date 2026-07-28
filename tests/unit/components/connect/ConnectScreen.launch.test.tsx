import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectScreen } from '@/components/connect/ConnectScreen';
import type { LiveRunOutcome, LiveRunRequest } from '@/live';

/**
 * The LIVE path of the Connect console, now actually wired: the launch button
 * calls the injected server action with exactly what the user typed, and renders
 * the typed outcome it gets back. The action is a fake here (the real one is
 * server-only), and the screen makes no claim the server did not make.
 */

async function goLive(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /LIVE · bring your agent/i }));
}

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/MCP ENDPOINT/i), 'https://agent.example/mcp');
  await user.type(screen.getByLabelText(/API KEY \/ TOKEN/i), 'sk-live-secret');
}

const ok = (runs: LiveRunOutcome extends { ok: true; runs: infer R } ? R : never): LiveRunOutcome =>
  ({ ok: true, runs, failed: [] }) as LiveRunOutcome;

describe('ConnectScreen · launching a live run', () => {
  it('sends the endpoint, key and selected categories to the server action', async () => {
    const user = userEvent.setup();
    const launchLiveRun = vi.fn<(input: LiveRunRequest) => Promise<LiveRunOutcome>>(async () =>
      ok([{ id: 'row-1', category: 'ASI01', compromised: false }]),
    );
    render(<ConnectScreen signedIn liveRunEnabled launchLiveRun={launchLiveRun} />);

    await goLive(user);
    await fillForm(user);
    await user.type(screen.getByLabelText(/MODEL ID/i), 'gpt-4.1');
    await user.click(screen.getByRole('checkbox', { name: /ASI02/ })); // deselect one
    await user.click(screen.getByRole('button', { name: /LAUNCH LIVE RUN/i }));

    await waitFor(() => expect(launchLiveRun).toHaveBeenCalledTimes(1));
    const sent = launchLiveRun.mock.calls[0]?.[0];
    expect(sent?.endpoint).toBe('https://agent.example/mcp');
    expect(sent?.apiKey).toBe('sk-live-secret');
    expect(sent?.modelId).toBe('gpt-4.1');
    expect(sent?.categories).toHaveLength(6);
    expect(sent?.categories).not.toContain('ASI02');
  });

  it('omits a blank model id rather than sending an empty string', async () => {
    const user = userEvent.setup();
    const launchLiveRun = vi.fn(async () => ok([]));
    render(<ConnectScreen signedIn liveRunEnabled launchLiveRun={launchLiveRun} />);
    await goLive(user);
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: /LAUNCH LIVE RUN/i }));
    await waitFor(() => expect(launchLiveRun).toHaveBeenCalled());
    expect(launchLiveRun.mock.calls[0]?.[0]).not.toHaveProperty('modelId');
  });

  it('renders the recorded runs, each linking to its own replay', async () => {
    const user = userEvent.setup();
    const launchLiveRun = vi.fn(async () =>
      ok([
        { id: 'row-1', category: 'ASI01', compromised: true },
        { id: 'row-2', category: 'ASI02', compromised: false },
      ]),
    );
    render(<ConnectScreen signedIn liveRunEnabled launchLiveRun={launchLiveRun} />);
    await goLive(user);
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: /LAUNCH LIVE RUN/i }));

    expect(await screen.findByText(/2 RUNS RECORDED/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ASI01' })).toHaveAttribute('href', '/runs/row-1');
    expect(screen.getByText('COMPROMISED')).toBeInTheDocument();
    expect(screen.getByText('CLEAR')).toBeInTheDocument();
  });

  it('clears the key from the form once the run has been accepted', async () => {
    const user = userEvent.setup();
    const launchLiveRun = vi.fn(async () => ok([]));
    render(<ConnectScreen signedIn liveRunEnabled launchLiveRun={launchLiveRun} />);
    await goLive(user);
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: /LAUNCH LIVE RUN/i }));
    await waitFor(() => expect(screen.getByLabelText(/API KEY \/ TOKEN/i)).toHaveValue(''));
  });

  it('surfaces the server refusal verbatim, and keeps the key so it can be retried', async () => {
    const user = userEvent.setup();
    const launchLiveRun = vi.fn(async (): Promise<LiveRunOutcome> => ({
      ok: false,
      code: 'CAP_EXCEEDED',
      message: 'Run limit reached: 20 runs per 24 hours. You have used 20.',
    }));
    render(<ConnectScreen signedIn liveRunEnabled launchLiveRun={launchLiveRun} />);
    await goLive(user);
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: /LAUNCH LIVE RUN/i }));

    expect(await screen.findByText(/Run limit reached: 20 runs per 24 hours/)).toBeInTheDocument();
    expect(screen.getByLabelText(/API KEY \/ TOKEN/i)).toHaveValue('sk-live-secret');
  });

  it('never calls the action for a signed-out visitor', async () => {
    const user = userEvent.setup();
    const launchLiveRun = vi.fn(async () => ok([]));
    render(<ConnectScreen signedIn={false} liveRunEnabled launchLiveRun={launchLiveRun} />);
    await goLive(user);
    await fillForm(user);
    expect(screen.getByRole('button', { name: /LAUNCH LIVE RUN/i })).toBeDisabled();
    expect(launchLiveRun).not.toHaveBeenCalled();
  });
});

describe('ConnectScreen · honesty about the locked judge', () => {
  it('states that live runs are not enabled when the validated judge is absent', async () => {
    const user = userEvent.setup();
    render(<ConnectScreen signedIn liveRunEnabled={false} />);
    await goLive(user);
    expect(screen.getByText(/LIVE RUNS NOT ENABLED YET/)).toBeInTheDocument();
    expect(screen.getByText(/validated detector is not connected/i)).toBeInTheDocument();
  });

  it('does not show that notice once the judge is connected', async () => {
    const user = userEvent.setup();
    render(<ConnectScreen signedIn liveRunEnabled />);
    await goLive(user);
    expect(screen.queryByText(/LIVE RUNS NOT ENABLED YET/)).not.toBeInTheDocument();
  });

  it('keeps the notice out of the free sample path', () => {
    render(<ConnectScreen signedIn liveRunEnabled={false} />);
    expect(screen.queryByText(/LIVE RUNS NOT ENABLED YET/)).not.toBeInTheDocument();
  });
});
