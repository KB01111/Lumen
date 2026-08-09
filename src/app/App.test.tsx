import {act, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it} from 'vitest';

import {defaultAppearance} from '../design-system/theme';
import {useLauncherStore} from '../features/launcher/launcher.store';
import {useQueryStore} from '../features/launcher/query.store';
import {useOnboardingStore} from '../features/onboarding/onboarding.store';
import {useSettingsStore} from '../features/settings/settings.store';
import {App} from './App';

afterEach(() => {
  useLauncherStore.getState().reset();
  useQueryStore.getState().reset();
  useOnboardingStore.getState().reset();
  useSettingsStore.getState().reset();
  window.history.replaceState({}, '', '/');
});

describe('App', () => {
  it('renders the Lumen application landmark', () => {
    render(<App />);

    expect(screen.getByRole('application', {name: 'Lumen'})).toBeVisible();
  });

  it('preserves the framework-independent appearance contract on the application root', () => {
    render(<App />);

    const root = screen.getByRole('application', {name: 'Lumen'});
    expect(root).toHaveAttribute('data-theme', defaultAppearance.mode);
    expect(root).toHaveAttribute('data-resolved-theme', 'light');
    expect(root).toHaveAttribute('data-transparency', defaultAppearance.transparency);
    expect(root).toHaveAttribute('data-contrast', 'standard');
    expect(root).toHaveAttribute('data-effects', defaultAppearance.effects);
    expect(root).toHaveAttribute('data-motion', defaultAppearance.motion);
    expect(root).toHaveAttribute('data-reduced-motion', 'false');
  });

  it('re-shows the mounted launcher through the DEV diagnostics event with its current query mode', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/?service=memory');
    render(<App />);
    const search = await screen.findByRole('searchbox', {name: 'Search files'});
    await user.type(search, 'quarterly report');
    await waitFor(() => expect(useQueryStore.getState().committed).toBe('quarterly report'));

    act(() => useLauncherStore.getState().hide());
    expect(useLauncherStore.getState().visible).toBe(false);
    act(() => window.dispatchEvent(new CustomEvent('lumen:diagnostics-show-launcher')));

    expect(useLauncherStore.getState()).toMatchObject({mode: 'expanded', visible: true});
    expect(screen.getByRole('searchbox', {name: 'Search files'})).toBe(search);
    expect(search).toHaveValue('quarterly report');
    expect(search).toHaveFocus();
  });
});
