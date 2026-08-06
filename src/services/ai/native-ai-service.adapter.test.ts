import {beforeEach, describe, expect, it, vi} from 'vitest';

const {invoke} = vi.hoisted(() => ({invoke: vi.fn()}));

vi.mock('@tauri-apps/api/core', () => ({invoke}));

import {nativeAiService} from './native-ai-service';

describe('nativeAiService', () => {
  beforeEach(() => invoke.mockReset());

  it('fails closed when gateway health is malformed', async () => {
    invoke.mockResolvedValue({state: 'ready', version: 'v1.4.1'});

    await expect(nativeAiService.gatewayHealth()).rejects.toThrow();
  });
});
