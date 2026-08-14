import {render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';

import {AppProviders} from '../../app/AppProviders';
import {useActivityStore} from '../activity/activity.store';
import {LauncherStatus} from './LauncherStatus';

function renderStatus(status: React.ReactNode) {
  return render(
    <AppProviders appearance={{
      mode: 'dark', transparency: 'disabled', effects: 'reduced', motion: 'reduced',
    }}>
      {status}
    </AppProviders>,
  );
}

afterEach(() => useActivityStore.getState().reset());

describe('LauncherStatus', () => {
  it('keeps searching text live while reduced motion uses a static active mark', () => {
    const {container} = renderStatus(<LauncherStatus label="Searching" searching />);

    expect(screen.getByText('Searching').closest('output')).toHaveAttribute('aria-live', 'polite');
    expect(container.querySelector('[data-activity-indicator]')).toHaveAttribute(
      'data-activity-state',
      'active',
    );
    expect(container.querySelector('[data-activity-running]')).not.toBeInTheDocument();
  });

  it('keeps ready and paused states static with explicit text', () => {
    const ready = renderStatus(<LauncherStatus label="8 results" />);
    expect(ready.container.querySelector('[data-activity-indicator]')).toHaveAttribute(
      'data-activity-state',
      'idle',
    );
    ready.unmount();

    useActivityStore.setState({active: true, mode: 'gaming'});
    const paused = renderStatus(<LauncherStatus label="8 results" searching />);
    expect(screen.getByText('Gaming pause')).toBeVisible();
    expect(paused.container.querySelector('[data-activity-indicator]')).toHaveAttribute(
      'data-activity-state',
      'idle',
    );
  });
});
