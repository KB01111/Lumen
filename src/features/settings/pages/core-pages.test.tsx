import {act, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it} from 'vitest';

import {AppProviders} from '../../../app/AppProviders';
import {defaultAppearanceSettings} from '../../../state/appearance.schema';
import {appearanceStore} from '../../../state/appearance.store';
import type {RootSelectionService} from '../../onboarding/root-selection-service';
import {useSettingsStore} from '../settings.store';
import {AppearancePage} from './AppearancePage';
import {ComputerUsePage} from './ComputerUsePage';
import {GeneralPage} from './GeneralPage';
import {IndexedRootsPage} from './IndexedRootsPage';
import {SearchPage} from './SearchPage';

class DeferredRootService implements RootSelectionService {
  private resolveSelection?: (path: string | null) => void;

  chooseRoot(): Promise<string | null> {
    return new Promise((resolve) => {
      this.resolveSelection = resolve;
    });
  }

  resolve(path: string | null) {
    this.resolveSelection?.(path);
  }
}

function renderWithProviders(children: React.ReactNode) {
  return render(<AppProviders>{children}</AppProviders>);
}

afterEach(() => {
  useSettingsStore.getState().reset();
  appearanceStore.setState({
    ...defaultAppearanceSettings,
    hydrationStatus: 'ready',
    persistenceStatus: 'idle',
    persistenceError: null,
  });
  localStorage.clear();
});

describe('core settings pages', () => {
  it('switches to opaque mode immediately when transparency is disabled', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppearancePage />);

    await user.click(screen.getByRole('switch', {name: 'Use transparency'}));

    await waitFor(() => expect(screen.getByRole('application', {name: 'Lumen'})).toHaveAttribute(
      'data-transparency',
      'disabled',
    ));
  });

  it('records a valid global shortcut from the General page', async () => {
    const user = userEvent.setup();
    renderWithProviders(<GeneralPage />);

    await user.click(screen.getByRole('button', {name: 'Global shortcut'}));
    await user.keyboard('{Control>}{Shift>}l{/Shift}{/Control}');

    expect(screen.getByRole('button', {name: 'Global shortcut'})).toHaveTextContent('Ctrl + Shift + L');
    expect(useSettingsStore.getState().general.shortcut).toBe('Ctrl + Shift + L');
  });

  it('adds, pauses, and removes an indexed root with confirmation', async () => {
    const user = userEvent.setup();
    const rootService = new DeferredRootService();
    renderWithProviders(<IndexedRootsPage rootService={rootService} />);

    await user.click(screen.getByRole('button', {name: 'Add root'}));
    await act(async () => rootService.resolve('C:\\Projects'));
    expect(await screen.findByText('C:\\Projects')).toBeVisible();

    await user.click(screen.getByRole('button', {name: 'Pause C:\\Projects'}));
    expect(screen.getByText('Paused')).toBeVisible();

    await user.click(screen.getByRole('button', {name: 'Remove C:\\Projects'}));
    expect(screen.getByRole('dialog', {name: 'Remove indexed root'})).toBeVisible();
    await user.click(screen.getByRole('button', {name: 'Remove root permanently'}));
    expect(screen.queryByText('C:\\Projects')).not.toBeInTheDocument();
  });

  it('rejects parent traversal in an exclusion pattern', async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({
      roots: [{
        id: 'projects',
        path: 'C:\\Projects',
        paused: false,
        exclusions: [],
        includeHidden: false,
        maxFileSizeMb: 256,
        status: 'ready',
      }],
    });
    renderWithProviders(<IndexedRootsPage />);

    await user.type(screen.getByRole('textbox', {name: 'Exclusion pattern for C:\\Projects'}), '..\\Secrets');
    await user.click(screen.getByRole('button', {name: 'Add exclusion for C:\\Projects'}));

    expect(screen.getByRole('alert')).toHaveTextContent('relative to this root');
  });

  it('labels semantic search and reranking as unavailable in phase one', () => {
    renderWithProviders(<SearchPage />);

    expect(screen.getByText('Semantic search is not connected in phase one.')).toBeVisible();
    expect(screen.getByText('Reranking is not connected in phase one.')).toBeVisible();
    expect(screen.getByRole('switch', {name: 'Semantic search'})).toBeDisabled();
    expect(screen.getByRole('switch', {name: 'Reranking'})).toBeDisabled();
  });

  it('records Computer Use cloud consent separately from answer consent', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ComputerUsePage />);

    await user.click(screen.getByRole('button', {name: 'Review Computer Use consent'}));
    await user.click(screen.getByRole('button', {name: 'Allow Computer Use'}));

    expect(useSettingsStore.getState().computerUse.cloudConsent).toBe(true);
    expect(useSettingsStore.getState().ai.cloudAnswerConsent).toBe(false);
    expect(screen.getByText('Consent granted')).toBeVisible();
  });

  it('rejects embedded credentials in a Computer Use start page', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ComputerUsePage />);

    const startPage = screen.getByRole('textbox', {name: 'Computer Use start page'});
    await user.clear(startPage);
    await user.type(startPage, 'https://user:secret@example.com');
    await user.click(screen.getByRole('button', {name: 'Save'}));

    expect(screen.getByText('The start page must be an absolute HTTP or HTTPS URL.')).toBeVisible();
    expect(useSettingsStore.getState().computerUse.initialUrl).toBe('https://www.google.com');
  });
});
