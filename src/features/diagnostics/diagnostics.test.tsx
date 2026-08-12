import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {AppProviders} from '../../app/AppProviders';
import {useSettingsStore} from '../settings/settings.store';
import {DiagnosticsPage} from '../settings/pages/DiagnosticsPage';
import {PrivacyPage} from '../settings/pages/PrivacyPage';
import {DiagnosticsOverlay} from './DiagnosticsOverlay';
import {createDiagnosticsExport, sanitizeDiagnostics} from './diagnostics.types';
import {useDiagnosticsStore} from './diagnostics.store';

function renderPage(children: React.ReactNode) {
  return render(<AppProviders appearance={{mode: 'dark', transparency: 'disabled', effects: 'reduced', motion: 'reduced'}}>{children}</AppProviders>);
}

afterEach(() => {
  useDiagnosticsStore.getState().reset();
  useSettingsStore.getState().reset();
});

describe('diagnostics privacy', () => {
  it('redacts paths and provider secrets from diagnostic exports', () => {
    const result = sanitizeDiagnostics({
      root: 'C:\\Users\\Kevin\\Secret',
      apiKey: 'token',
      message: 'Failed at C:\\Users\\Kevin\\Secret\\note.txt',
      version: '1.0.0',
    });
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('Kevin');
    expect(serialized).not.toContain('token');
    expect(serialized).toContain('[local-path]');
    expect(serialized).toContain('[redacted]');
  });

  it('creates a stable export payload without local root paths', () => {
    const payload = createDiagnosticsExport({
      appVersion: '0.1.0',
      roots: ['C:\\Private'],
      providerToken: 'secret-value',
    });

    expect(payload.filename).toMatch(/^lumen-diagnostics-/);
    expect(payload.contents).not.toContain('Private');
    expect(payload.contents).not.toContain('secret-value');
  });

  it('opens the development overlay from the keyboard without a render loop', async () => {
    const user = userEvent.setup();
    renderPage(<DiagnosticsOverlay />);

    await user.keyboard('{Control>}{Shift>}d{/Shift}{/Control}');

    expect(screen.getByRole('complementary', {name: 'Performance diagnostics'})).toBeVisible();
    expect(screen.getByText('Refresh estimate')).toBeVisible();
    expect(screen.getByRole('button', {name: 'Refresh diagnostics'})).toBeVisible();
  });

  it('lets the development-only overlay be dismissed without changing diagnostics state', async () => {
    const user = userEvent.setup();
    useDiagnosticsStore.getState().setOverlay(true);
    renderPage(<DiagnosticsOverlay />);

    await user.click(screen.getByRole('button', {name: 'Close diagnostics'}));

    expect(screen.queryByRole('complementary', {name: 'Performance diagnostics'})).not.toBeInTheDocument();
    expect(useDiagnosticsStore.getState().overlayOpen).toBe(false);
  });

  it('shows complete runtime fields on the Diagnostics page', () => {
    renderPage(<DiagnosticsPage />);

    for (const field of ['Application', 'WebView2', 'Tauri', 'Monitor', 'DPI scale', 'Refresh estimate', 'Active animations', 'React commit', 'Activity', 'AgentGateway', 'Provider routes', 'Logs']) {
      expect(screen.getByText(field)).toBeVisible();
    }
  });

  it('clears durable local history without presenting unimplemented analysis controls', async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({privacy: {...useSettingsStore.getState().privacy, historyEntries: 12}});
    const localDataService = {
      setPreviewsEnabled: vi.fn(async () => undefined),
      getHistoryStatus: vi.fn(async () => ({entryCount: 12, enabled: true})),
      clearSearchHistory: vi.fn(async () => ({entryCount: 0})),
      deleteIndexData: vi.fn(async () => ({deletedFiles: 0, deletedChunks: 0})),
      getNativeDiagnostics: vi.fn(async () => ({})),
    };
    renderPage(<PrivacyPage localDataService={localDataService} />);

    await user.click(screen.getByRole('button', {name: 'Clear search history'}));
    await user.click(screen.getByRole('button', {name: 'Clear 12 history entries'}));

    await waitFor(() => expect(localDataService.clearSearchHistory).toHaveBeenCalledOnce());
    expect(useSettingsStore.getState().privacy.historyEntries).toBe(0);
    expect(screen.queryByRole('switch', {name: 'OCR analysis'})).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', {name: 'Image understanding'})).not.toBeInTheDocument();
  });

  it('applies preview privacy before persisting and deletes only generated index data', async () => {
    const user = userEvent.setup();
    const localDataService = {
      setPreviewsEnabled: vi.fn(async () => undefined),
      getHistoryStatus: vi.fn(async () => ({entryCount: 0, enabled: true})),
      clearSearchHistory: vi.fn(async () => ({entryCount: 0})),
      deleteIndexData: vi.fn(async () => ({deletedFiles: 4, deletedChunks: 9})),
      getNativeDiagnostics: vi.fn(async () => ({})),
    };
    renderPage(<PrivacyPage localDataService={localDataService} />);

    await user.click(screen.getByRole('switch', {name: 'File previews'}));
    await waitFor(() => expect(localDataService.setPreviewsEnabled).toHaveBeenCalledWith(false));
    expect(useSettingsStore.getState().privacy.previewsEnabled).toBe(false);

    await user.click(screen.getByRole('button', {name: /Delete index/}));
    await user.click(screen.getByRole('button', {name: 'Delete local index data'}));

    await waitFor(() => expect(localDataService.deleteIndexData).toHaveBeenCalledOnce());
    expect(screen.getByText(/4 files and 9 chunks/)).toBeVisible();
  });
});
