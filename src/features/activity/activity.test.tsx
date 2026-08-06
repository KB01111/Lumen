import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {AppProviders} from '../../app/AppProviders';
import {LauncherStatus} from '../launcher/LauncherStatus';
import {ActivityPage} from '../settings/pages/ActivityPage';
import {useSettingsStore} from '../settings/settings.store';
import {ActivityStatus} from './ActivityStatus';
import {useActivityStore} from './activity.store';
import type {ActivityMode} from './activity.types';

function renderPage(children: React.ReactNode) {
  return render(<AppProviders appearance={{mode: 'dark', transparency: 'disabled', effects: 'reduced', motion: 'reduced'}}>{children}</AppProviders>);
}

afterEach(() => {
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  useActivityStore.getState().reset();
  useSettingsStore.getState().reset();
});

describe('activity classifications', () => {
  it.each(['indexing', 'slow', 'gaming', 'fullscreen', 'cinema', 'idle', 'battery', 'user'] satisfies ActivityMode[])(
    'renders activity mode %s without color-only meaning',
    (mode) => {
      renderPage(<ActivityStatus mode={mode} />);
      expect(screen.getByTestId(`activity-${mode}`)).toHaveTextContent(/./);
      expect(screen.getByTestId(`activity-${mode}`)).toHaveAccessibleName();
    },
  );

  it('contracts the launcher status into a quiet paused indicator', () => {
    useActivityStore.setState({active: true, mode: 'gaming'});
    renderPage(<LauncherStatus label="8 results" />);

    expect(screen.getByText('Gaming pause')).toBeVisible();
    expect(screen.queryByText('8 results')).not.toBeInTheDocument();
    expect(screen.getByTestId('launcher-activity')).toHaveAttribute('data-activity-compact', 'true');
  });

  it('keeps unavailable automatic policies disabled without changing compatibility state', () => {
    renderPage(<ActivityPage />);

    expect(screen.getByRole('button', {name: 'Pause background work'})).toBeDisabled();
    expect(screen.getByText('Manual background pause requires the native Windows app.')).toBeVisible();
    expect(screen.getByRole('switch', {name: 'Detect games automatically'})).toBeDisabled();
    expect(screen.getByRole('switch', {name: 'Pause on battery'})).toBeDisabled();
    expect(screen.getByRole('button', {name: /Resume delay/})).toBeDisabled();
    expect(screen.getByText('No Windows game detector is connected.')).toBeVisible();
    expect(useSettingsStore.getState().activity).toMatchObject({detectGames: true, pauseOnBattery: true});
  });

  it('pauses and resumes only after the native operation succeeds', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {configurable: true, value: {}});
    const pauseEnrichment = vi.fn().mockImplementation(() => {
      expect(useActivityStore.getState()).toMatchObject({active: false, mode: 'indexing'});
      return Promise.resolve();
    });
    const resumeEnrichment = vi.fn().mockImplementation(() => {
      expect(useActivityStore.getState()).toMatchObject({active: true, mode: 'user'});
      return Promise.resolve();
    });
    renderPage(<ActivityPage runtimeService={{pauseEnrichment, resumeEnrichment}} />);

    expect(screen.getByTestId('activity-manual')).toHaveTextContent('Manual control available');
    expect(screen.queryByText('New local filenames are being discovered at normal priority.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', {name: 'Pause background work'}));
    expect(await screen.findByText('Background indexing and enrichment paused.')).toBeVisible();
    expect(screen.getByTestId('activity-user')).toHaveTextContent('Paused by user');
    expect(pauseEnrichment).toHaveBeenCalledOnce();
    expect(useActivityStore.getState()).toMatchObject({
      active: true,
      manualPauseActive: true,
      mode: 'user',
    });

    await user.click(screen.getByRole('button', {name: 'Resume background work'}));
    expect(await screen.findByText('Background indexing and enrichment resumed.')).toBeVisible();
    expect(screen.getByTestId('activity-manual')).toHaveTextContent('Manual control available');
    expect(resumeEnrichment).toHaveBeenCalledOnce();
    expect(useActivityStore.getState()).toMatchObject({
      active: false,
      manualPauseActive: false,
      mode: 'indexing',
    });
  });

  it('leaves the Activity store unchanged when native pause fails', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {configurable: true, value: {}});
    renderPage(<ActivityPage runtimeService={{
      pauseEnrichment: vi.fn().mockRejectedValue(new Error('worker offline')),
      resumeEnrichment: vi.fn(),
    }} />);

    await user.click(screen.getByRole('button', {name: 'Pause background work'}));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Background work could not be paused: worker offline',
    );
    expect(useActivityStore.getState()).toMatchObject({active: false, mode: 'indexing'});
  });

  it('keeps the pause gate active when native resume fails', async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {configurable: true, value: {}});
    useActivityStore.getState().setUserPaused(true);
    renderPage(<ActivityPage runtimeService={{
      pauseEnrichment: vi.fn(),
      resumeEnrichment: vi.fn().mockRejectedValue(new Error('worker offline')),
    }} />);

    await user.click(screen.getByRole('button', {name: 'Resume background work'}));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Background work could not be resumed: worker offline',
    );
    expect(useActivityStore.getState()).toMatchObject({
      active: true,
      manualPauseActive: true,
      mode: 'user',
    });
  });

  it('preserves stored overrides and games behind disabled controls', () => {
    useSettingsStore.setState((state) => ({
      activity: {
        ...state.activity,
        overrides: [{id: 'render', application: 'render.exe', policy: 'pause'}],
        userGames: ['game.exe'],
      },
    }));
    renderPage(<ActivityPage />);

    expect(screen.getByText('render.exe')).toBeVisible();
    expect(screen.getByText('game.exe')).toBeVisible();
    expect(screen.getByRole('textbox', {name: 'Application override'})).toBeDisabled();
    expect(screen.getByRole('button', {name: 'Add application override'})).toBeDisabled();
    expect(screen.getByRole('button', {name: /Policy for render.exe/})).toBeDisabled();
    expect(screen.getByRole('button', {name: 'Remove game game.exe'})).toBeDisabled();
  });

  it('sets explicit manual pause state deterministically', () => {
    useActivityStore.getState().setUserPaused(true);
    expect(useActivityStore.getState()).toMatchObject({
      active: true,
      manualPauseActive: true,
      mode: 'user',
      message: 'Background indexing and enrichment paused.',
    });

    useActivityStore.getState().setMode('gaming');
    useActivityStore.getState().resetClassifications();
    expect(useActivityStore.getState()).toMatchObject({
      active: true,
      manualPauseActive: true,
      mode: 'user',
      message: 'Manual background pause remains active.',
    });

    useActivityStore.getState().setUserPaused(false);
    expect(useActivityStore.getState()).toMatchObject({
      active: false,
      manualPauseActive: false,
      mode: 'indexing',
      message: 'Background indexing and enrichment resumed.',
    });

    useActivityStore.getState().setMode('user');
    expect(useActivityStore.getState()).toMatchObject({
      active: true,
      manualPauseActive: false,
      mode: 'user',
    });
  });
});
