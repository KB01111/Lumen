import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it} from 'vitest';

import {BrowserWindowService} from '../../platform/window/browser-window-service';
import {useLauncherStore} from './launcher.store';
import {CollapsedLauncher} from './CollapsedLauncher';
import {useQueryStore} from './query.store';
import {useScopeStore} from './scope.store';

afterEach(() => {
  useLauncherStore.getState().reset();
  useQueryStore.getState().reset();
  useScopeStore.getState().reset();
});

describe('CollapsedLauncher', () => {
  it('commits an IME query only after composition ends', async () => {
    const user = userEvent.setup();
    render(<CollapsedLauncher windowService={new BrowserWindowService()} />);
    const input = screen.getByRole('searchbox', {name: 'Search files'});

    fireEvent.compositionStart(input);
    await user.type(input, 'ルーメン');
    expect(useQueryStore.getState().committed).toBe('');

    fireEvent.compositionEnd(input);
    expect(useQueryStore.getState().committed).toBe('ルーメン');
  });

  it('expands for a Unicode query and preserves long controlled input', async () => {
    const user = userEvent.setup();
    const windowService = new BrowserWindowService();
    render(<CollapsedLauncher windowService={windowService} />);
    const input = screen.getByRole('searchbox', {name: 'Search files'});
    const query = `årsrapport-${'very-long-'.repeat(16)}終`;

    await user.type(input, query);

    expect(input).toHaveValue(query);
    await waitFor(() =>
      expect(windowService.snapshot()).toMatchObject({
        mode: 'expanded',
        visible: true,
        width: 800,
      }),
    );
  });

  it('clears on the first Escape and hides on the second', async () => {
    const user = userEvent.setup();
    const windowService = new BrowserWindowService();
    render(<CollapsedLauncher windowService={windowService} />);
    const input = screen.getByRole('searchbox', {name: 'Search files'});

    await user.type(input, 'report');
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('');
    expect(useLauncherStore.getState().mode).toBe('collapsed');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(windowService.snapshot().visible).toBe(false));
    expect(useLauncherStore.getState().visible).toBe(false);
  });

  it('exposes named controls and all eight scopes when expanded', async () => {
    const user = userEvent.setup();
    useQueryStore.getState().setDraft('docs');
    render(
      <CollapsedLauncher
        windowService={new BrowserWindowService()}
        onVoiceRequest={() => undefined}
      />,
    );

    expect(screen.getByRole('button', {name: 'Start voice input'})).toBeVisible();
    expect(
      await screen.findByRole('tablist', {name: 'Search scopes'}),
    ).toBeVisible();
    expect(screen.getAllByRole('tab')).toHaveLength(8);

    await user.click(screen.getByRole('tab', {name: 'Documents'}));
    expect(useScopeStore.getState().activeScope).toBe('documents');
  });

  it('switches to an explicit browser-agent task without exposing file scopes', async () => {
    const user = userEvent.setup();
    let submitted = '';
    render(
      <CollapsedLauncher
        windowService={new BrowserWindowService()}
        onComputerSubmit={(task) => submitted = task}
      />,
    );

    await user.click(screen.getByRole('button', {name: 'Switch to Computer Use'}));
    const input = screen.getByRole('searchbox', {name: 'Describe a browser task'});
    await user.type(input, 'Find the latest Lumen release{Enter}');

    expect(useLauncherStore.getState().intent).toBe('computer');
    expect(screen.queryByRole('tablist', {name: 'Search scopes'})).not.toBeInTheDocument();
    expect(submitted).toBe('Find the latest Lumen release');
    expect(useQueryStore.getState().committed).toBe('Find the latest Lumen release');
  });
});
