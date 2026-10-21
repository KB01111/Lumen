import {describe, expect, test} from 'bun:test';
import {resolve} from 'node:path';
import {createPiMemoryClient} from '../runtime/pi-durable/src/memory';
import {createDeepAgentsMemoryClient} from '../runtime/deepagents/src/memory';
import type {MemoryTransport} from '../runtime/shared/memory';

const binary = resolve(process.env.CARGO_TARGET_DIR ?? 'lumen-agent-core/target', 'debug/examples', `memory_protocol${process.platform === 'win32' ? '.exe' : ''}`);
const nativeTransport: MemoryTransport = async (request) => {
  const child = Bun.spawnSync([binary], {stdin: Buffer.from(`${JSON.stringify(request)}\n`)});
  expect(child.exitCode).toBe(0);
  return JSON.parse(child.stdout.toString().trim());
};
test('the fixture closes an oversized frame without admitting a following request', () => {
  const child = Bun.spawnSync([binary], {stdin: Buffer.from(`${'x'.repeat(4096)}\n{"version":1,"query":{"text":"","limit":1}}\n`)});
  expect(child.exitCode).toBe(0);
  expect(child.stdout.toString().trim()).toBe('{"error":"invalid"}');
});

test('the fixture accepts a maximum-size request with CRLF framing', () => {
  const request = '{"version":1,"query":{"text":"file tools","limit":1}}'.padEnd(2048, ' ');
  const child = Bun.spawnSync([binary], {stdin: Buffer.from(`${request}\r\n`)});
  expect(child.exitCode).toBe(0);
  expect(JSON.parse(child.stdout.toString().trim()).memories).toHaveLength(1);
});
for (const [name, create] of [['Pi Durable', createPiMemoryClient], ['DeepAgentsJS', createDeepAgentsMemoryClient]] as const) {
  describe(`${name} -> Rust MemoryReader`, () => {
    test('retrieves approved memory with native provenance while Beacon is absent', async () => {
      const response = await create(nativeTransport).retrieve({text: 'file tools', limit: 5});
      expect(response.memories).toHaveLength(1);
      expect(response.memories[0].record.scope.projectId).toBe('fixture-project');
      expect(response.memories[0].approval.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(response.unavailable).toEqual([{id: 'beacon.local', state: 'unavailable'}]);
    });
    test('cannot retrieve pending memory', async () => {
      expect((await create(nativeTransport).retrieve({text: 'Unapproved secret', limit: 5})).memories).toHaveLength(0);
    });
    test('the native reader rejects attempts to add worker-controlled scope', async () => {
      const response = await nativeTransport({...{version: 1 as const, query: {text: '', limit: 5}}, scope: {projectId: 'other'}} as Parameters<MemoryTransport>[0]);
      expect(response).toEqual({error: 'invalid'});
    });
  });
}
