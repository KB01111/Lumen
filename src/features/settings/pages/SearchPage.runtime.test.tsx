import {render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';

import {AppProviders} from '../../../app/AppProviders';
import {useSettingsStore} from '../settings.store';
import {SearchPage} from './SearchPage';

afterEach(() => {
  useSettingsStore.getState().reset();
  localStorage.clear();
});

describe('SearchPage runtime settings', () => {
  it('keeps supported ranking controls active and labels pinning unavailable', () => {
    render(<AppProviders><SearchPage /></AppProviders>);

    expect(screen.getByRole('slider', {name: 'Filename priority'})).toBeEnabled();
    expect(screen.getByRole('button', {name: /Recency preference/})).toBeEnabled();
    expect(screen.getByRole('switch', {name: 'Pinned items'})).toBeDisabled();
    expect(screen.getByText('Pin state is not available from the local search adapters.')).toBeVisible();
  });
});
