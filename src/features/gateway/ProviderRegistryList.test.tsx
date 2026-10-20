import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it} from 'vitest';

import type {ProviderRegistrySnapshot, ProviderRouteUpdate} from '../../services/ai/provider-registry-service';
import {ProviderRegistryList} from './ProviderRegistryList';

const registry: ProviderRegistrySnapshot = {
  providers: [
    {id: 'local', label: 'Local runtime', cloud: false, credentialConfigured: true},
    {id: 'openai', label: 'OpenAI', cloud: true, credentialConfigured: true},
    {id: 'openai-compatible', label: 'Compatible', cloud: true, credentialConfigured: true},
  ],
  models: [
    {id: 'local:answer', label: 'Local answer', providerId: 'local', capabilities: ['answer']},
    {id: 'openai:first', label: 'Answer model', providerId: 'openai', capabilities: ['answer']},
    {id: 'openai:second', label: 'Answer model', providerId: 'openai', capabilities: ['answer']},
    {id: 'openai:embedding', label: 'Embedding model', providerId: 'openai', capabilities: ['embedding']},
    {id: 'compatible:answer', label: 'Custom answer', providerId: 'openai-compatible', capabilities: ['answer']},
  ],
  routes: [{alias: 'lumen.answer.cloud', capability: 'answer', providerId: 'openai', modelId: 'openai:first', status: 'ready', baseUrl: null, upstreamModel: null}],
};

describe('ProviderRegistryList model selection', () => {
  it('uses native selection to apply the model ID when visible labels match', async () => {
    const user = userEvent.setup();
    const updates: ProviderRouteUpdate[] = [];
    render(<ProviderRegistryList registry={registry} cloudConsent onSet={async (update) => {updates.push(update);}} onTest={async () => undefined} />);
    const select = screen.getByRole('combobox', {name: 'Model for lumen.answer.cloud'});

    expect(within(select).queryByRole('option', {name: /Local answer|Embedding model/})).not.toBeInTheDocument();
    expect(within(select).getAllByRole('option', {name: 'OpenAI · Answer model'})).toHaveLength(2);
    await user.selectOptions(select, 'openai:second');
    expect(select).toHaveValue('openai:second');
    expect(updates).toEqual([{alias: 'lumen.answer.cloud', providerId: 'openai', modelId: 'openai:second', baseUrl: null, upstreamModel: null}]);
  });

  it('requires explicit complete custom settings before applying a compatible route', async () => {
    const user = userEvent.setup();
    const updates: ProviderRouteUpdate[] = [];
    render(<ProviderRegistryList registry={registry} cloudConsent onSet={async (update) => {updates.push(update);}} onTest={async () => undefined} />);
    await user.selectOptions(screen.getByRole('combobox', {name: 'Model for lumen.answer.cloud'}), 'compatible:answer');
    const apply = screen.getByRole('button', {name: 'Apply'});
    expect(apply).toBeDisabled();
    await user.type(screen.getByRole('textbox', {name: 'Base URL for lumen.answer.cloud'}), 'https://example.com/v1');
    expect(apply).toBeDisabled();
    await user.type(screen.getByRole('textbox', {name: 'Upstream model for lumen.answer.cloud'}), 'custom-model');
    expect(updates).toEqual([]);
    await user.click(apply);
    expect(updates).toEqual([{alias: 'lumen.answer.cloud', providerId: 'openai-compatible', modelId: 'compatible:answer', baseUrl: 'https://example.com/v1', upstreamModel: 'custom-model'}]);
  });
});
