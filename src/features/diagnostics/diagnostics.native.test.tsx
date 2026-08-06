import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {AppProviders} from '../../app/AppProviders';
import {nativeAiService} from '../../services/ai/native-ai-service';
import {useActivityStore} from '../activity/activity.store';
import {useNativeGatewayHealthStore} from '../gateway/native-gateway-health.store';
import {DiagnosticsPage} from '../settings/pages/DiagnosticsPage';
import {useDiagnosticsStore} from './diagnostics.store';

vi.mock('../../services/ai/native-ai-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/ai/native-ai-service')>();
  return {...actual, isNativeRuntime: () => true};
});

afterEach(() => {
  useNativeGatewayHealthStore.getState().reset();
  useDiagnosticsStore.getState().reset();
  useActivityStore.getState().reset();
});

describe('native diagnostics gateway state', () => {
  function mockNativeHealth() {
    vi.spyOn(nativeAiService, 'gatewayHealth').mockResolvedValue({
      state: 'ready',
      version: '1.4.1',
      interactivePort: 18080,
      enrichmentPort: 18081,
      adminPort: 18082,
      cloudCredentialConfigured: false,
      detail: undefined,
    });
    vi.spyOn(nativeAiService, 'enrichmentHealth').mockResolvedValue({
      state: 'unavailable',
      processorState: 'ready',
      coordinatorState: 'unavailable',
      paused: false,
      controlPort: 19080,
      actorPort: 19081,
      detail: 'Rivet coordination is unavailable.',
      processorDetail: 'Durable SQLite processing remains ready.',
      coordinatorDetail: 'Rivet is unavailable.',
    });
  }

  it('actively samples parsed native health rather than browser preview routes', async () => {
    mockNativeHealth();
    useActivityStore.getState().setMode('gaming');

    await useDiagnosticsStore.getState().sampleNativeHealth();

    const snapshot = useDiagnosticsStore.getState().snapshot;
    expect(nativeAiService.gatewayHealth).toHaveBeenCalledOnce();
    expect(nativeAiService.enrichmentHealth).toHaveBeenCalledOnce();
    expect(snapshot.gateway).toBe('ready');
    expect(snapshot.activity).toBe('Manual control available');
    expect(snapshot.providerRoutes).toEqual([
      'interactive loopback :18080 (ready)',
      'enrichment processor loopback :19080 (ready)',
      'Rivet coordinator loopback :19081 (unavailable)',
      'cloud credential (not configured)',
    ]);
  });

  it('samples on page open and resamples before preparing an export', async () => {
    const user = userEvent.setup();
    mockNativeHealth();
    render(
      <AppProviders appearance={{mode: 'dark', transparency: 'disabled', effects: 'reduced', motion: 'reduced'}}>
        <DiagnosticsPage />
      </AppProviders>,
    );

    await waitFor(() => expect(nativeAiService.gatewayHealth).toHaveBeenCalledOnce());
    expect(await screen.findByText('interactive loopback :18080 (ready); enrichment processor loopback :19080 (ready); Rivet coordinator loopback :19081 (unavailable); cloud credential (not configured)')).toBeVisible();

    await user.click(screen.getByRole('button', {name: 'Prepare diagnostics export'}));

    await waitFor(() => expect(nativeAiService.gatewayHealth).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/lumen-diagnostics-.*\.json is prepared for review\./)).toBeVisible();
  });
});
