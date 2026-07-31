import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it} from 'vitest';

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

  it('shows complete runtime fields on the Diagnostics page', () => {
    renderPage(<DiagnosticsPage />);

    for (const field of ['Application', 'WebView2', 'Tauri', 'Monitor', 'DPI scale', 'Refresh estimate', 'Active animations', 'React commit', 'Activity', 'AgentGateway', 'Provider routes', 'Logs']) {
      expect(screen.getByText(field)).toBeVisible();
    }
  });

  it('clears local history and keeps future analysis controls explicitly unavailable', async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({privacy: {...useSettingsStore.getState().privacy, historyEntries: 12}});
    renderPage(<PrivacyPage />);

    await user.click(screen.getByRole('button', {name: 'Clear search history'}));
    await user.click(screen.getByRole('button', {name: 'Clear 12 history entries'}));

    expect(useSettingsStore.getState().privacy.historyEntries).toBe(0);
    expect(screen.getByRole('switch', {name: 'OCR analysis'})).toBeDisabled();
    expect(screen.getByRole('switch', {name: 'Image understanding'})).toBeDisabled();
  });
});
