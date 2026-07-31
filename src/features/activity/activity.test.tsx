import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it} from 'vitest';

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

  it('updates automatic detection and battery policies', async () => {
    const user = userEvent.setup();
    renderPage(<ActivityPage />);

    await user.click(screen.getByRole('switch', {name: 'Detect games automatically'}));
    await user.click(screen.getByRole('switch', {name: 'Pause on battery'}));

    expect(useSettingsStore.getState().activity).toMatchObject({detectGames: false, pauseOnBattery: false});
  });

  it('adds a per-application override and resets classifications', async () => {
    const user = userEvent.setup();
    renderPage(<ActivityPage />);

    await user.type(screen.getByRole('textbox', {name: 'Application override'}), 'render.exe');
    await user.click(screen.getByRole('button', {name: 'Add application override'}));
    expect(screen.getByText('render.exe')).toBeVisible();

    await user.click(screen.getByRole('button', {name: 'Reset classifications'}));
    expect(screen.getByText('Automatic classifications reset.')).toBeVisible();
  });
});
