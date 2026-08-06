import {act, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';

import {makeSessionReliefReport} from '../../services/session-relief/session-relief.fixture';
import type {SessionReliefService} from '../../services/session-relief/session-relief-service';
import {SessionReliefPage} from './SessionReliefPage';

function deferred<T>() {
  let resolve: (value: T) => void;
  let reject: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject; });
  return {promise, resolve: resolve!, reject: reject!};
}

describe('SessionReliefPage', () => {
  it('shows the privacy boundary and bounded collecting state', async () => {
    const pending = deferred<ReturnType<typeof makeSessionReliefReport>>();
    const service: SessionReliefService = {collect: vi.fn(() => pending.promise)};
    const user = userEvent.setup();
    render(<SessionReliefPage service={service} />);

    expect(screen.getByText('All analysis stays on this device.', {exact: false})).toBeVisible();
    await user.click(screen.getByRole('button', {name: 'Analyze this session'}));
    expect(screen.getByRole('status')).toHaveTextContent('Sampling current CPU and memory use');
    expect(screen.getByRole('button', {name: 'Analyze this session'})).toBeDisabled();
    await act(async () => { pending.resolve(makeSessionReliefReport({warnings: []})); });
  });

  it('renders a report, supports accessible tree expansion, and redacts copied text', async () => {
    const copyText = vi.fn(async (text: string) => { void text; });
    const service: SessionReliefService = {collect: vi.fn(async () => makeSessionReliefReport({warnings: []}))};
    const user = userEvent.setup();
    render(<SessionReliefPage service={service} copyText={copyText} />);

    await user.click(screen.getByRole('button', {name: 'Analyze this session'}));
    expect(await screen.findByText('Memory available')).toBeVisible();
    const expand = screen.getByRole('button', {name: 'Expand process tree for cline.exe'});
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    await user.click(expand);
    expect(expand).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('node.exe · PID 4101')).toBeVisible();
    await user.click(screen.getByRole('button', {name: 'Copy safe summary'}));
    await waitFor(() => expect(copyText).toHaveBeenCalledOnce());
    expect(copyText.mock.calls[0]?.[0]).not.toContain('4100');
    expect(copyText.mock.calls[0]?.[0]).not.toContain('trees');
  });

  it('keeps a prior report when refresh or copying fails', async () => {
    const report = makeSessionReliefReport({warnings: []});
    const service: SessionReliefService = {collect: vi.fn().mockResolvedValueOnce(report).mockRejectedValueOnce(new Error('raw native error'))};
    const user = userEvent.setup();
    render(<SessionReliefPage service={service} copyText={async () => { throw new Error('clipboard denied'); }} />);

    await user.click(screen.getByRole('button', {name: 'Analyze this session'}));
    expect(await screen.findByText('Memory available')).toBeVisible();
    await user.click(screen.getByRole('button', {name: 'Refresh report'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Lumen could not complete the local session analysis.');
    expect(screen.getByText('Memory available')).toBeVisible();
    await user.click(screen.getByRole('button', {name: 'Copy safe summary'}));
    expect(await screen.findByText('Lumen could not copy the safe session summary.')).toBeVisible();
    expect(screen.getByText('Memory available')).toBeVisible();
  });
});
