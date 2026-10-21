import {beforeEach, describe, expect, it, vi} from 'vitest';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({invoke}));
import {createAgentMemoryManagementService} from './agent-memory-service';

describe('native memory management boundary', () => {
  beforeEach(() => invoke.mockReset());
  it('parses native provider configuration and rejects unknown fields', async () => {
    const service = createAgentMemoryManagementService();
    invoke.mockResolvedValue([{id: 'beacon.local', state: 'disabled'}]);
    expect(await service.providers()).toEqual([{id: 'beacon.local', state: 'disabled'}]);
    invoke.mockResolvedValue([{id: 'beacon.local', state: 'enabled', capture: true}]);
    await expect(service.providers()).rejects.toThrow();
  });
  it('requires a review handle and bounded retention before approval IPC', async () => {
    const service = createAgentMemoryManagementService();
    await expect(service.approve('made-up', {kind: 'days', days: 30})).rejects.toThrow();
    await expect(service.approve('00000000-0000-4000-8000-000000000000', {kind: 'days', days: 0})).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });
});
