import {render, screen, within} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {LumenAgentActivity} from './LumenAgentActivity';
import {AgentActivityHistory} from './AgentActivityHistory';

const entries = [
  {id: 1, label: 'Session started', tone: 'accent'},
  {id: 2, label: 'Click requested', tone: 'neutral'},
] as const;

describe('LumenAgentActivity', () => {
  it('reports session completion without claiming individual actions completed', () => {
    render(<LumenAgentActivity phase="completed" entries={entries} />);

    const region = screen.getByRole('region', {name: 'Agent execution progress'});
    expect(within(region).getByText('Completed', {exact: true})).toBeInTheDocument();
    const history = within(region).getByRole('list', {name: 'Computer Use activity'});
    expect(within(history).getAllByRole('listitem')).toHaveLength(2);
    expect(history).toHaveTextContent('Click requested');
    expect(history).not.toHaveTextContent('Click completed');
  });

  it('preserves the safety controls tab order by keeping all history visible without a disclosure', () => {
    render(<LumenAgentActivity phase="running" entries={entries} />);

    const region = screen.getByRole('region', {name: 'Agent execution progress'});
    expect(within(region).queryByRole('button')).not.toBeInTheDocument();
    expect(within(region).getByRole('list', {name: 'Computer Use activity'})).toHaveTextContent('Click requested');
  });

  it.each(['approval', 'stopping', 'stopped'] as const)('never reports %s as successful completion', (phase) => {
    render(<LumenAgentActivity phase={phase} entries={entries} />);

    const region = screen.getByRole('region', {name: 'Agent execution progress'});
    expect(region).not.toHaveTextContent(/\b(?:complete|completed)\b/i);
    expect(region).toHaveTextContent(phase === 'approval' ? 'Waiting for your approval' : phase === 'stopping' ? 'Stopping' : 'Stopped');
    if (phase === 'stopped') {
      expect(within(region).getByRole('list', {name: 'Computer Use activity'})).toHaveTextContent('Click requested');
    }
  });

  it('keeps appearance attributes local through mount and unmount', () => {
    const before = document.documentElement.outerHTML.slice(0, document.documentElement.outerHTML.indexOf('>') + 1);
    const {unmount} = render(<LumenAgentActivity phase="running" entries={entries} />);

    expect(document.documentElement.getAttribute('data-astryx-theme')).toBeNull();
    expect(document.documentElement.outerHTML.slice(0, document.documentElement.outerHTML.indexOf('>') + 1)).toBe(before);
    expect(screen.getByRole('region', {name: 'Agent execution progress'})).toHaveAttribute('data-astryx-theme', 'lumen-agent');
    unmount();
    expect(document.documentElement.outerHTML.slice(0, document.documentElement.outerHTML.indexOf('>') + 1)).toBe(before);
  });

  it('adds no activity surface while idle with no history', () => {
    const {container} = render(<LumenAgentActivity phase="idle" entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps approval state and full history available through the lightweight fallback', () => {
    render(<AgentActivityHistory phase="approval" entries={entries} />);

    expect(screen.getByRole('status')).toHaveTextContent('Waiting for your approval');
    expect(screen.getByRole('list', {name: 'Computer Use activity'})).toHaveTextContent('Click requested');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
