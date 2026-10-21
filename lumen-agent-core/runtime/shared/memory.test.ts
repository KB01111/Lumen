import {describe, expect, it, vi} from 'vitest';
import {createPiMemoryClient} from '../pi-durable/src/memory';
import {createDeepAgentsMemoryClient} from '../deepagents/src/memory';
import type {MemoryRetrieval} from './memory';

const query = {text: 'file tools', limit: 5};
const result = (): MemoryRetrieval => ({
  version: 1,
  memories: [{
    providerId: 'lumen.native',
    record: {sourceId: 'one', scope: {projectId: 'lumen', sessionId: null}, content: 'Use approved file tools.', provenance: {source: 'explicit-user-note', revision: '1'}},
    approval: {id: 'approved', contentHash: 'a'.repeat(64), approvedAt: 1, expiresAt: null},
  }],
  unavailable: [{id: 'beacon.local', state: 'disabled'}],
});
describe.each([createPiMemoryClient, createDeepAgentsMemoryClient])('shared memory reader', (create) => {
  it('retrieves approved context with one versioned request and exposes no management API', async () => {
    const transport = vi.fn().mockResolvedValue(result());
    const client = create(transport);
    expect(await client.retrieve(query)).toEqual(result());
    expect(transport).toHaveBeenCalledWith({version: 1, query}, undefined);
    expect(Object.keys(client)).toEqual(['retrieve']);
  });
  it('rejects attempts to add a worker-selected scope or provider', async () => {
    const transport = vi.fn();
    await expect(create(transport).retrieve({...query, scope: 'other'} as typeof query)).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  it('rejects unapproved, expired and unknown-version responses', async () => {
    const missing = {...result(), memories: [{...result().memories[0], approval: undefined}]};
    const expired = result(); expired.memories[0].approval.expiresAt = 2;
    for (const response of [missing, expired, {...result(), version: 2}, {...result(), policy: 'allow'}]) {
      await expect(create(async () => response).retrieve(query)).rejects.toThrow();
    }
  });
  it('returns provider unavailability without requiring an installation', async () => {
    expect(await create(async () => ({version: 1, memories: [], unavailable: [{id: 'beacon.local', state: 'unavailable'}]})).retrieve(query))
      .toMatchObject({memories: [], unavailable: [{state: 'unavailable'}]});
  });
  it('propagates cancellation before and after transport I/O', async () => {
    const controller = new AbortController();
    const transport = vi.fn(async () => { controller.abort(); return result(); });
    await expect(create(transport).retrieve(query, controller.signal)).rejects.toThrow();
    transport.mockClear();
    await expect(create(transport).retrieve(query, controller.signal)).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
});
