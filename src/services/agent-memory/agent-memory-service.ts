import {z} from 'zod';
import {invoke} from '@tauri-apps/api/core';
import {memoryApprovalSchema, memoryRecordSchema, memoryScopeSchema, providerStatusSchema} from '../../../lumen-agent-core/runtime/shared/memory';

const retentionSchema = z.discriminatedUnion('kind', [
  z.object({kind: z.literal('days'), days: z.number().int().min(1).max(365)}).strict(),
  z.object({kind: z.literal('untilDeleted')}).strict(),
]);
const reviewSchema = z.object({
  reviewId: z.string().uuid(), providerId: z.string().min(1).max(128),
  record: memoryRecordSchema, contentHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

/** User-management service. Never expose this object to a harness or generated tool. */
export function createAgentMemoryManagementService() {
  return {
    async providers() { return z.array(providerStatusSchema).max(8).parse(await invoke('agent_memory_providers')); },
    async setProvider(id: string, enabled: boolean) {
      z.object({id: z.string().min(1).max(128), enabled: z.boolean()}).strict().parse({id, enabled});
      await invoke('set_agent_memory_provider', {id, enabled});
    },
    async reviewNative(record: z.infer<typeof memoryRecordSchema>) {
      return reviewSchema.parse(await invoke('review_native_agent_memory', {record: memoryRecordSchema.parse(record)}));
    },
    async reviewProvider(provider: string, scope: z.infer<typeof memoryScopeSchema>, id: string) {
      return reviewSchema.parse(await invoke('review_provider_agent_memory', {provider, scope: memoryScopeSchema.parse(scope), id}));
    },
    async approve(reviewId: string, retention: z.infer<typeof retentionSchema>) {
      z.string().uuid().parse(reviewId);
      return memoryApprovalSchema.parse(await invoke('approve_agent_memory', {reviewId, retention: retentionSchema.parse(retention)}));
    },
    async delete(provider: string, scope: z.infer<typeof memoryScopeSchema>, id: string) {
      await invoke('delete_agent_memory', {provider, scope: memoryScopeSchema.parse(scope), id});
    },
    async pruneExpired() { await invoke('prune_agent_memory'); },
  };
}
