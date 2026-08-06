import {act, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';

import {AppProviders} from '../../app/AppProviders';
import {AnswerPanel} from './AnswerPanel';

describe('AnswerPanel', () => {
  it('exposes the actual route and lets the user switch execution mode', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();

    render(
      <AppProviders>
        <AnswerPanel
          answer={{
            phase: 'completed',
            text: 'Revenue increased.',
            citations: [{fileId: 'report', label: 'Report.pdf', page: 4}],
            provider: 'openai',
            model: 'gpt-5.4-mini',
            route: 'lumen.answer.cloud',
          }}
          mode="cloud"
          onModeChange={onModeChange}
          onOpenCitation={vi.fn()}
          onRetry={vi.fn()}
          onStop={vi.fn()}
        />
      </AppProviders>,
    );

    expect(screen.getByText('Revenue increased.')).toBeInTheDocument();
    expect(screen.getByText(/openai · gpt-5.4-mini/)).toBeInTheDocument();
    expect(screen.getByRole('radio', {name: 'Cloud'})).toBeChecked();
    expect(screen.getByRole('button', {name: 'Open Report.pdf, page 4'})).toBeInTheDocument();

    await user.click(screen.getByRole('radio', {name: 'Local'}));
    expect(onModeChange).toHaveBeenCalledWith('local');
  });

  it('offers a stop action while an answer is streaming', async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();

    render(
      <AppProviders>
        <AnswerPanel
          answer={{phase: 'streaming', text: 'Partial', citations: []}}
          mode="auto"
          onModeChange={vi.fn()}
          onOpenCitation={vi.fn()}
          onRetry={vi.fn()}
          onStop={onStop}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole('button', {name: 'Stop answer'}));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it('shows a visible runtime-mode failure without changing the rendered mode', async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <AnswerPanel
          answer={{phase: 'idle', text: '', citations: []}}
          mode="auto"
          onModeChange={async () => { throw new Error('The native runtime did not accept that mode.'); }}
          onOpenCitation={vi.fn()}
          onRetry={vi.fn()}
          onStop={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole('radio', {name: 'Cloud'}));

    expect(await screen.findByRole('alert')).toHaveTextContent('The native runtime did not accept that mode.');
    expect(screen.getByRole('radio', {name: 'Auto'})).toBeChecked();
  });

  it('serializes runtime-mode mutations while the native transaction is pending', async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    const pending = new Promise<void>((nextResolve) => { resolve = nextResolve; });
    const onModeChange = vi.fn(() => pending);
    render(
      <AppProviders>
        <AnswerPanel
          answer={{phase: 'idle', text: '', citations: []}}
          mode="auto"
          onModeChange={onModeChange}
          onOpenCitation={vi.fn()}
          onRetry={vi.fn()}
          onStop={vi.fn()}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole('radio', {name: 'Local'}));
    expect(screen.getByRole('radio', {name: 'Cloud'})).toBeDisabled();
    await user.click(screen.getByRole('radio', {name: 'Cloud'}));
    expect(onModeChange).toHaveBeenCalledOnce();
    await act(async () => resolve());
    await waitFor(() => expect(screen.getByRole('radio', {name: 'Cloud'})).toBeEnabled());
  });
});

