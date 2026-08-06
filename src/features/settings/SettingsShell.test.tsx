import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {App} from '../../app/App';
import {LumenMotionProvider} from '../../design-system/MotionProvider';
import {SettingsShell} from './SettingsShell';
import {useSettingsStore} from './settings.store';

function renderShell(onClose = vi.fn()) {
  return render(
    <LumenMotionProvider reducedMotion>
      <SettingsShell onClose={onClose} />
    </LumenMotionProvider>,
  );
}

afterEach(() => {
  useSettingsStore.getState().reset();
  localStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('SettingsShell', () => {
  it('exposes all eleven pages in one persistent navigation rail', () => {
    renderShell();

    expect(screen.getByRole('navigation', {name: 'Settings'})).toBeVisible();
    expect(screen.getAllByRole('tab')).toHaveLength(11);
    expect(screen.getByRole('heading', {name: 'General'})).toBeVisible();
    expect(screen.getByTestId('settings-content')).toHaveStyle({overflowY: 'auto'});
  });

  it('opens Session Relief from the settings rail', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('tab', {name: 'Session Relief'}));
    expect(await screen.findByRole('heading', {name: 'Session Relief'})).toBeVisible();
    expect(screen.getByRole('button', {name: 'Analyze this session'})).toBeVisible();
    expect(useSettingsStore.getState().activePage).toBe('session-relief');
  });

  it('changes pages with keyboard tab navigation and persists the route', async () => {
    const user = userEvent.setup();
    const view = renderShell();
    const appearance = screen.getByRole('tab', {name: 'Appearance'});

    appearance.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', {name: 'Appearance'})).toBeVisible();
    expect(useSettingsStore.getState().activePage).toBe('appearance');

    view.unmount();
    renderShell();
    expect(await screen.findByRole('heading', {name: 'Appearance'})).toBeVisible();
  });

  it('closes with Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderShell(onClose);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('opens from search with Ctrl+Comma and restores search focus on Escape', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/?service=memory');
    render(<App />);

    expect(await screen.findByRole('searchbox')).toHaveFocus();
    await user.keyboard('{Control>},{/Control}');
    expect(await screen.findByRole('navigation', {name: 'Settings'})).toBeVisible();

    await user.keyboard('{Escape}');
    expect(await screen.findByRole('searchbox')).toHaveFocus();
  });
});
