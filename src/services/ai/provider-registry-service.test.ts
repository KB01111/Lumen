import {describe, expect, it, vi} from 'vitest';

import {TauriProviderRegistryService} from './provider-registry-service';

describe('TauriProviderRegistryService', () => {
  it('validates secret-free provider, model, and route DTOs', async () => {
    const invoke = vi.fn(async () => ({
      providers: [{id: 'openai', label: 'OpenAI', cloud: true, credentialConfigured: false}],
      models: [{id: 'openai:gpt-5-mini', label: 'GPT-5 mini', providerId: 'openai', capabilities: ['answer']}],
      routes: [{alias: 'lumen.answer.cloud', capability: 'answer', providerId: 'openai', modelId: 'openai:gpt-5-mini', status: 'needsCredential', baseUrl: null, upstreamModel: null}],
    }));
    const service = new TauriProviderRegistryService(invoke);

    await expect(service.list()).resolves.toMatchObject({
      providers: [{id: 'openai'}],
      routes: [{alias: 'lumen.answer.cloud', status: 'needsCredential'}],
    });
    expect(invoke).toHaveBeenCalledWith('list_provider_registry');
  });

  it('sends only a closed route update and parses rollback-aware results', async () => {
    const invoke = vi.fn(async () => ({
      applied: true,
      message: 'Route applied.',
      route: {alias: 'lumen.answer.cloud', capability: 'answer', providerId: 'google', modelId: 'google:gemini-2.5-flash', status: 'needsCredential', baseUrl: null, upstreamModel: null},
    }));
    const service = new TauriProviderRegistryService(invoke);
    const update = {alias: 'lumen.answer.cloud', providerId: 'google' as const, modelId: 'google:gemini-2.5-flash', baseUrl: null, upstreamModel: null};

    await expect(service.setRoute(update)).resolves.toMatchObject({applied: true});
    expect(invoke).toHaveBeenCalledWith('set_provider_route', {update});
  });
});
