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
import {providerRegistryService} from '../../services/ai/provider-registry-service';
import {mcpService} from '../../services/ai/mcp-service';

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

  it('exposes live MCP status and native executor permissions', async () => {
    const user = userEvent.setup();
    vi.spyOn(nativeAiService, 'gatewayHealth').mockResolvedValue({
      state: 'ready', version: '1.0.0', interactivePort: 8080, enrichmentPort: 8081,
      adminPort: 8082, cloudCredentialConfigured: false,
    });
    vi.spyOn(nativeAiService, 'enrichmentHealth').mockResolvedValue({
      state: 'ready', paused: false, controlPort: 8090, actorPort: 8091,
    });
    vi.spyOn(providerRegistryService, 'list').mockResolvedValue({
      providers: [
        {id: 'local', label: 'Local runtime', cloud: false, credentialConfigured: true},
        {id: 'openai', label: 'OpenAI', cloud: true, credentialConfigured: false},
      ],
      models: [
        {id: 'local:qwen3.5:4b', label: 'Qwen 3.5 4B', providerId: 'local', capabilities: ['answer']},
        {id: 'openai:gpt-5-mini', label: 'GPT-5 mini', providerId: 'openai', capabilities: ['answer']},
      ],
      routes: [
        {alias: 'lumen.answer.local', capability: 'answer', providerId: 'local', modelId: 'local:qwen3.5:4b', status: 'ready', baseUrl: null, upstreamModel: null},
        {alias: 'lumen.answer.cloud', capability: 'answer', providerId: 'openai', modelId: 'openai:gpt-5-mini', status: 'needsConsent', baseUrl: null, upstreamModel: null},
      ],
    });
    vi.spyOn(mcpService, 'list').mockResolvedValue({
      services: [{id: 'lumen-local', name: 'Lumen local tools', status: 'connected', tools: ['files.search', 'files.metadata', 'files.open']}],
      permissions: [
        {id: 'files.search', label: 'Search indexed files', description: 'Search file names in the confined local index.', access: 'allow'},
        {id: 'files.metadata', label: 'Read file metadata', description: 'Read bounded metadata for a selected indexed file.', access: 'allow'},
        {id: 'files.open', label: 'Open files', description: 'Open a selected indexed file.', access: 'ask'},
      ],
    });
    const setPermission = vi.spyOn(mcpService, 'setPermission').mockResolvedValue({
      id: 'files.open', label: 'Open files', description: 'Open a selected indexed file.', access: 'deny',
    });

    renderPage(<AgentGatewayPage nativeRuntime />);

    expect(await screen.findByText(/AgentGateway 1.0.0/)).toBeVisible();
    expect(screen.getByText('lumen.answer.local')).toBeVisible();
    expect(screen.getByLabelText('Model for lumen.answer.cloud')).toBeDisabled();
    expect(screen.getByRole('region', {name: 'MCP services'})).toBeVisible();
    expect(screen.getByText('3 confined local tools')).toBeVisible();
    expect(screen.getByRole('region', {name: 'Tool permissions'})).toBeVisible();
    expect(screen.getByLabelText('Permission for Open files')).toBeVisible();
    await user.click(screen.getByLabelText('Permission for Open files'));
    await user.click(await screen.findByRole('option', {name: 'Deny'}));
    expect(setPermission).toHaveBeenCalledWith('files.open', 'deny');
    expect(screen.queryByRole('button', {name: /Preview/})).not.toBeInTheDocument();
  });
});
