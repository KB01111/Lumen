import {describe, expect, it, vi} from 'vitest';

import {TauriMcpService} from './mcp-service';

describe('TauriMcpService', () => {
  it('validates live services and permission state', async () => {
    const invoke = vi.fn(async () => ({
      services: [{id: 'lumen-local', name: 'Lumen local tools', status: 'connected', tools: ['files.search', 'files.metadata', 'files.open']}],
      permissions: [{id: 'files.search', label: 'Search indexed files', description: 'Search names in the local index.', access: 'allow'}],
    }));
    const service = new TauriMcpService(invoke);

    await expect(service.list()).resolves.toMatchObject({services: [{status: 'connected'}]});
    expect(invoke).toHaveBeenCalledWith('list_mcp_services');
  });

  it('sets only closed permission values', async () => {
    const invoke = vi.fn(async () => ({id: 'files.open', label: 'Open files', description: 'Open a selected local file.', access: 'ask'}));
    const service = new TauriMcpService(invoke);

    await expect(service.setPermission('files.open', 'ask')).resolves.toMatchObject({access: 'ask'});
    expect(invoke).toHaveBeenCalledWith('set_tool_permission', {toolId: 'files.open', access: 'ask'});
  });
});
