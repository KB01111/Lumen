import {render, screen, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {AppProviders} from '../../../app/AppProviders';
import {nativeAiService} from '../../../services/ai/native-ai-service';
import {useNativeGatewayHealthStore} from '../../gateway/native-gateway-health.store';
import {AgentGatewayPage} from './AgentGatewayPage';

vi.mock('../../../services/ai/native-ai-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/ai/native-ai-service')>();
  return {
    ...actual,
    isNativeRuntime: () => true,
    nativeAiService: {
      ...actual.nativeAiService,
      gatewayHealth: vi.fn(),
      enrichmentHealth: vi.fn(),
    },
  };
});

describe('AgentGatewayPage native capability boundary', () => {
  beforeEach(() => {
    useNativeGatewayHealthStore.getState().reset();
    vi.mocked(nativeAiService.gatewayHealth).mockResolvedValue({
      state: 'ready',
      version: '1.4.1',
      interactivePort: 18080,
      enrichmentPort: 18081,
      adminPort: 18082,
      cloudCredentialConfigured: false,
    });
    vi.mocked(nativeAiService.enrichmentHealth).mockResolvedValue({
      state: 'ready',
      processorState: 'ready',
      coordinatorState: 'ready',
      paused: false,
      controlPort: 19080,
      actorPort: 19081,
      processorDetail: undefined,
      coordinatorDetail: undefined,
      detail: undefined,
    });
  });

  it('shows native MCP/tool capability gaps instead of simulated connected services and tests', async () => {
    render(<AppProviders><AgentGatewayPage /></AppProviders>);

    await waitFor(() => expect(nativeAiService.gatewayHealth).toHaveBeenCalledOnce());
    expect(screen.getByText('MCP service connections')).toBeVisible();
    expect(screen.getByText('Not connected')).toBeVisible();
    expect(screen.getByText('Native MCP tool permissions')).toBeVisible();
    expect(screen.queryByRole('button', {name: /Test .*MCP/i})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Preview'})).not.toBeInTheDocument();
  });
});
