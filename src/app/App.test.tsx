import {act, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it} from 'vitest';

import {defaultAppearance} from '../design-system/theme';
import {useActivityStore} from '../features/activity/activity.store';
import {useLauncherStore} from '../features/launcher/launcher.store';
import {useQueryStore} from '../features/launcher/query.store';
import {useOnboardingStore} from '../features/onboarding/onboarding.store';
import {useSettingsStore} from '../features/settings/settings.store';
import {BrowserWindowService} from '../platform/window/browser-window-service';
import type {ActivityService} from '../services/activity/activity-service';
import {App} from './App';

class ReactivatableWindowService extends BrowserWindowService {
  reactivateCollapsed() {
    this.publishNativeState({mode: 'collapsed', source: 'shortcut', visible: true});
  }
}

afterEach(() => {
  useLauncherStore.getState().reset();
  useQueryStore.getState().reset();
  useOnboardingStore.getState().reset();
  useSettingsStore.getState().reset();
  useActivityStore.getState().reset();
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

  it('uses the typed unavailable answer service outside the native runtime', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/?service=memory');
    render(<App />);

    const search = await screen.findByRole('searchbox', {name: 'Search files'});
    await user.type(search, 'report');
    await user.keyboard('{Enter}');

    expect(await screen.findByTestId('answer-region')).toHaveTextContent(
      'The answer runtime is not ready. Local search is still available.',
    );
  });

  it('routes the DEV gallery through the app window lifecycle and retains gallery ownership', async () => {
    const windowService = new ReactivatableWindowService();
    window.history.replaceState({}, '', '/?gallery=1&scenario=collapsed-idle');

    render(<App windowService={windowService} />);

    expect(await screen.findByRole(
      'region',
      {name: 'Lumen visual state gallery'},
      {timeout: 5_000},
    )).toBeVisible();
    await waitFor(() => expect(windowService.snapshot()).toMatchObject({
      mode: 'gallery',
      visible: true,
      width: 1120,
      height: 760,
    }));
    expect(useLauncherStore.getState()).toMatchObject({mode: 'gallery', visible: true});

    act(() => windowService.reactivateCollapsed());

    await waitFor(() => expect(windowService.snapshot()).toMatchObject({
      mode: 'gallery',
      visible: true,
      width: 1120,
      height: 760,
    }));
    expect(useLauncherStore.getState()).toMatchObject({mode: 'gallery', visible: true});
  });

  it('reflects native activity without making exact search unavailable', async () => {
    window.history.replaceState({}, '', '/?service=memory');
    const activityService: ActivityService = {
      status: async () => ({
        mode: 'gaming',
        backgroundPolicy: 'paused',
        foregroundIdentity: 'a'.repeat(64),
        fullscreen: true,
        onBattery: false,
      }),
      setUserPause: async () => Promise.reject(new Error('unused')),
      setPolicy: async () => Promise.reject(new Error('unused')),
      chooseExecutable: async () => null,
    };

    render(<App activityService={activityService} />);

    expect(await screen.findByRole('searchbox', {name: 'Search files'})).toBeVisible();
    await waitFor(() => expect(useActivityStore.getState()).toMatchObject({
      active: true,
      mode: 'gaming',
    }));
  });
});
