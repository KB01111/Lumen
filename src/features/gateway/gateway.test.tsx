import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {AppProviders} from '../../app/AppProviders';
import {LauncherStatus} from '../launcher/LauncherStatus';
import {AgentGatewayPage} from '../settings/pages/AgentGatewayPage';
import {LocalAiPage} from '../settings/pages/LocalAiPage';
import {useSettingsStore} from '../settings/settings.store';
import {useGatewayStore} from './gateway.store';
import type {GatewayState, HardwareState, ModelState} from './gateway.types';
import {nativeAiService} from '../../services/ai/native-ai-service';

function renderPage(children: React.ReactNode) {
  return render(<AppProviders appearance={{mode: 'dark', transparency: 'disabled', effects: 'reduced', motion: 'reduced'}}>{children}</AppProviders>);
}

afterEach(() => {
  useGatewayStore.getState().reset();
  useSettingsStore.getState().reset();
});

describe('Local AI states', () => {
  it.each(['npu', 'gpu', 'cpu', 'unavailable'] satisfies HardwareState[])(
    'renders hardware state %s without color-only meaning',
    (hardware) => {
      renderPage(<LocalAiPage model={{hardware, state: 'ready'}} />);
      expect(screen.getByTestId(`hardware-${hardware}`)).toHaveTextContent(/./);
    },
  );

  it.each(['missing', 'downloading', 'loading', 'ready', 'failed', 'fallback-active'] satisfies ModelState[])(
    'renders model state %s deterministically',
    (state) => {
      renderPage(<LocalAiPage model={{hardware: 'cpu', state, progress: 42}} />);
      expect(screen.getByTestId(`model-${state}`)).toBeVisible();
      if (state === 'downloading') {
        expect(screen.getByRole('progressbar', {name: 'Model download'})).toHaveAttribute('aria-valuenow', '42');
      }
    },
  );
});

describe('AgentGateway states and controls', () => {
  it.each(['starting', 'ready', 'unavailable'] satisfies GatewayState[])(
    'renders gateway state %s',
    (state) => {
      useGatewayStore.setState({gatewayState: state});
      renderPage(<><LauncherStatus label="8 local results" /><AgentGatewayPage /></>);
      expect(screen.getByTestId(`gateway-${state}`)).toHaveTextContent(/./);
      expect(within(screen.getByTestId(`gateway-${state}`)).getByRole('status')).toBeVisible();
      expect(screen.getByText('8 local results')).toBeVisible();
    },
  );

  it('changes a provider route and preserves its virtual alias', async () => {
    const user = userEvent.setup();
    renderPage(<AgentGatewayPage />);

    await user.click(screen.getByRole('button', {name: /Provider for lumen\.fast/}));
    await user.click(await screen.findByRole('option', {name: 'Windows local preview'}));
    expect(useGatewayStore.getState().routes[0]).toMatchObject({alias: 'lumen.fast', providerId: 'windows-local'});
  });

  it('requires explicit cloud consent and records the decision', async () => {
    const user = userEvent.setup();
    renderPage(<AgentGatewayPage />);

    await user.click(screen.getByRole('button', {name: 'Review cloud consent'}));
    expect(screen.getByRole('dialog', {name: 'Allow cloud provider requests?'})).toBeVisible();
    await user.click(screen.getByRole('button', {name: 'Allow cloud requests'}));

    expect(useSettingsStore.getState().ai.cloudAnswerConsent).toBe(true);
    expect(screen.getByText('Cloud consent granted')).toBeVisible();
  });

  it('tests provider and MCP actions as deterministic previews', async () => {
    const user = userEvent.setup();
    renderPage(<AgentGatewayPage />);

    await user.click(screen.getByRole('button', {name: 'Test local provider'}));
    expect(await screen.findByText('Local provider preview responded in 18 ms.')).toBeVisible();

    await user.click(screen.getByRole('button', {name: 'Test Files MCP'}));
    expect(await screen.findByText('Files MCP preview exposed 3 tools.')).toBeVisible();
  });

  it('does not expose simulated MCP or permission controls in the native app', async () => {
    vi.spyOn(nativeAiService, 'gatewayHealth').mockResolvedValue({
      state: 'ready', version: '1.0.0', interactivePort: 8080, enrichmentPort: 8081,
      adminPort: 8082, cloudCredentialConfigured: false,
    });
    vi.spyOn(nativeAiService, 'enrichmentHealth').mockResolvedValue({
      state: 'ready', paused: false, controlPort: 8090, actorPort: 8091,
    });

    renderPage(<AgentGatewayPage nativeRuntime />);

    expect(await screen.findByText(/AgentGateway 1.0.0/)).toBeVisible();
    expect(screen.queryByRole('region', {name: 'MCP services'})).not.toBeInTheDocument();
    expect(screen.queryByRole('region', {name: 'Tool permissions'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: /Preview/})).not.toBeInTheDocument();
  });
});
