import {describe, expect, it} from 'vitest';

import {enrichmentHealthSchema, gatewayHealthSchema, localRuntimeHealthSchema} from './native-ai-service';

describe('native AI IPC schemas', () => {
  it('rejects malformed gateway health rather than treating it as ready', () => {
    expect(() => gatewayHealthSchema.parse({state: 'ready', version: 'v1'})).toThrow();
  });

  it('rejects malformed local runtime health payloads', () => {
    expect(() => localRuntimeHealthSchema.parse({profile: 'generic-local', state: 'ready'})).toThrow();
  });

  it('normalizes nullable native option fields and preserves degraded enrichment truth', () => {
    expect(gatewayHealthSchema.parse({
      state: 'ready',
      version: '1.4.1',
      interactivePort: 1,
      enrichmentPort: 2,
      adminPort: 3,
      cloudCredentialConfigured: false,
      detail: null,
    }).detail).toBeUndefined();
    expect(enrichmentHealthSchema.parse({
      state: 'unavailable',
      processorState: 'ready',
      coordinatorState: 'unavailable',
      paused: false,
      controlPort: 4,
      actorPort: 5,
      detail: 'Rivet unavailable',
      processorDetail: null,
      coordinatorDetail: 'Rivet unavailable',
    })).toMatchObject({
      state: 'unavailable',
      processorState: 'ready',
      coordinatorState: 'unavailable',
      processorDetail: undefined,
    });
  });
});
