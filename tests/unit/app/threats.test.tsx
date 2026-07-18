import { render, screen, within } from '@testing-library/react';
import ThreatsPage from '@/app/(hud)/threats/page';

/**
 * /threats — Threat Model / Coverage. An editorial reference over all ten OWASP
 * Agentic categories: seven COVERED, three NOT MEASURABLE (--status-inert, never
 * red). These tests assert the honest substance renders (pinned codes + titles,
 * the measurability bar, the three-state legend, and the not-measurable reasons)
 * and that the not-measurable state never borrows the breach-red signal.
 */

const PINNED: Array<[string, string]> = [
  ['ASI01', 'Agent Goal Hijack'],
  ['ASI02', 'Tool Misuse and Exploitation'],
  ['ASI03', 'Identity and Privilege Abuse'],
  ['ASI04', 'Agentic Supply Chain Vulnerabilities'],
  ['ASI05', 'Unexpected Code Execution (RCE)'],
  ['ASI06', 'Memory & Context Poisoning'],
  ['ASI07', 'Insecure Inter-Agent Communication'],
  ['ASI08', 'Cascading Agent Failures'],
  ['ASI09', 'Human-Agent Trust Exploitation'],
  ['ASI10', 'Rogue Agents'],
];

describe('Threat Model / Coverage (/threats)', () => {
  it('renders a single level-1 heading (heading order starts at h1)', () => {
    render(<ThreatsPage />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('states the measurability bar in the header', () => {
    render(<ThreatsPage />);
    expect(screen.getByText(/observable in the agent.s own steps/i)).toBeInTheDocument();
    expect(screen.getByText(/inside one bounded run/i)).toBeInTheDocument();
    expect(screen.getByText(/compromised at step N, or not/i)).toBeInTheDocument();
  });

  it('renders all ten codes with their pinned titles verbatim', () => {
    render(<ThreatsPage />);
    for (const [code, title] of PINNED) {
      expect(screen.getByText(code)).toBeInTheDocument();
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it('pins ASI04 as "Vulnerabilities" and never "Compromise"', () => {
    render(<ThreatsPage />);
    expect(screen.getByText('Agentic Supply Chain Vulnerabilities')).toBeInTheDocument();
    expect(screen.queryByText(/Agentic Supply Chain Compromise/i)).not.toBeInTheDocument();
  });

  it('shows a three-state legend: covered, not measurable, addable', () => {
    render(<ThreatsPage />);
    const legend = screen.getByRole('list', { name: /coverage legend/i });
    expect(within(legend).getByText(/covered/i)).toBeInTheDocument();
    expect(within(legend).getByText(/not measurable/i)).toBeInTheDocument();
    expect(within(legend).getByText(/addable/i)).toBeInTheDocument();
  });

  it('marks ASI07/08/09 NOT MEASURABLE with their honest reasons', () => {
    render(<ThreatsPage />);
    const cases: Array<[string, RegExp]> = [
      ['ASI07', /no agent-to-agent step type/i],
      ['ASI08', /propagation of a fault/i],
      ['ASI09', /human.s decision/i],
    ];
    for (const [code, reason] of cases) {
      const entry = screen.getByTestId(`threat-${code}`);
      expect(entry).toHaveAttribute('data-state', 'inert');
      expect(within(entry).getByText(/not measurable/i)).toBeInTheDocument();
      expect(within(entry).getByText(reason)).toBeInTheDocument();
    }
  });

  it('never styles the not-measurable state with breach red', () => {
    render(<ThreatsPage />);
    for (const code of ['ASI07', 'ASI08', 'ASI09']) {
      const entry = screen.getByTestId(`threat-${code}`);
      // No breach/red token or class leaks into the inert state.
      expect(entry.innerHTML).not.toMatch(/breach|red-|status-breach|glow-breach/i);
      expect(entry.querySelector('[class*="breach"]')).toBeNull();
      // The inert marker resolves through the neutral token, not a status one.
      expect(entry.innerHTML).toContain('var(--status-inert)');
    }
  });

  it('covers the seven Core-7 categories (state=covered)', () => {
    render(<ThreatsPage />);
    for (const code of ['ASI01', 'ASI02', 'ASI03', 'ASI04', 'ASI05', 'ASI06', 'ASI10']) {
      expect(screen.getByTestId(`threat-${code}`)).toHaveAttribute('data-state', 'covered');
    }
  });

  it('links every entry to the OWASP source on genai.owasp.org', () => {
    render(<ThreatsPage />);
    const owasp = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href')?.includes('genai.owasp.org'));
    expect(owasp.length).toBeGreaterThanOrEqual(10);
    for (const a of owasp) {
      expect(a).toHaveAttribute('href', expect.stringContaining('genai.owasp.org'));
    }
  });
});
