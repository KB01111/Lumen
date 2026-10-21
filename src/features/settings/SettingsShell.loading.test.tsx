import {act, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';

const gate = vi.hoisted(() => {
  let release = () => {};
  const pending = new Promise<void>((resolve) => { release = resolve; });
  return {pending, release, ready: false};
});

vi.mock('./pages/GeneralPage', () => ({GeneralPage: () => {
  if (!gate.ready) throw gate.pending;
  return <p>General controls loaded</p>;
}}));
vi.mock('./pages/DiagnosticsPage', () => ({DiagnosticsPage: () => {
  throw new Error('private internal failure');
}}));

import {LumenMotionProvider} from '../../design-system/MotionProvider';
import {SettingsShell} from './SettingsShell';
import {useSettingsStore} from './settings.store';

afterEach(() => {
  useSettingsStore.getState().reset();
  localStorage.clear();
});

describe('Settings page loading', () => {
  it('keeps navigation and close available while content loads without moving focus', async () => {
    useSettingsStore.setState({activePage: 'general', hydrated: true});
    render(<LumenMotionProvider reducedMotion><SettingsShell onClose={vi.fn()} /></LumenMotionProvider>);
    expect(await screen.findByRole('navigation', {name: 'Settings'})).toBeVisible();
    expect(screen.getByRole('button', {name: 'Close settings'})).toBeEnabled();
    await waitFor(() => expect(screen.getByText('Loading settings…')).toBeVisible());
    const general = screen.getByRole('tab', {name: 'General'});
    general.focus();
    await act(async () => { gate.ready = true; gate.release(); });
    expect(await screen.findByText('General controls loaded')).toBeVisible();
    expect(general).toHaveFocus();
  });

  it('contains a page failure and allows navigation to another page', async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({activePage: 'diagnostics', hydrated: true});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(<LumenMotionProvider reducedMotion><SettingsShell onClose={vi.fn()} /></LumenMotionProvider>);
      expect(await screen.findByRole('alert')).toHaveTextContent('This settings page could not load.');
      expect(screen.queryByText('private internal failure')).not.toBeInTheDocument();
      expect(screen.getByRole('button', {name: 'Reload Lumen'})).toBeEnabled();
      await user.click(screen.getByRole('tab', {name: 'Privacy'}));
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
      expect(await screen.findByRole('switch', {name: 'File previews'})).toBeVisible();
    } finally {
      error.mockRestore();
    }
  });
});
