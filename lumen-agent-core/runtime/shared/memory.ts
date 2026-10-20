import {z} from 'zod';

const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_.:-]+$/);
function hasControls(value: string, allowWhitespace = false) {
  return Array.from(value).some((char) => {
    const code = char.codePointAt(0)!;
    return (code < 32 || (code >= 127 && code <= 159)) && !(allowWhitespace && (code === 9 || code === 10));
  });
}
const withinBytes = (value: string, max: number) => new TextEncoder().encode(value).byteLength <= max;
export const memoryScopeSchema = z.object({projectId: id, sessionId: id.nullable()}).strict();
export const memoryQuerySchema = z.object({
  text: z.string().max(512).refine((text) => withinBytes(text, 512) && !hasControls(text)),
  limit: z.number().int().min(1).max(20),
}).strict();
const text = (max: number) => z.string().min(1).max(max)
  .refine((value) => value.trim().length > 0 && withinBytes(value, max) && !hasControls(value, true));
export const memoryRecordSchema = z.object({
  sourceId: id,
  scope: memoryScopeSchema,
  content: text(16_384),
  provenance: z.object({source: text(256), revision: text(256)}).strict(),
}).strict();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const memoryApprovalSchema = z.object({
  id, contentHash: hash,
  approvedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  expiresAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
}).strict();
export const providerStatusSchema = z.object({
  id, state: z.enum(['enabled', 'disabled', 'unavailable']),
}).strict();
export const memoryRetrievalSchema = z.object({
  version: z.literal(1),
  memories: z.array(z.object({providerId: id, record: memoryRecordSchema, approval: memoryApprovalSchema}).strict()).max(20),
  unavailable: z.array(providerStatusSchema).max(8),
}).strict();
export type MemoryScope = z.infer<typeof memoryScopeSchema>;
export type MemoryQuery = z.infer<typeof memoryQuerySchema>;
export type MemoryRetrieval = z.infer<typeof memoryRetrievalSchema>;
export type MemoryTransport = (request: {version: 1; query: MemoryQuery}, signal?: AbortSignal) => Promise<unknown>;

/** The native host binds project, session, providers and local model route before issuing this transport. */
export function createMemoryClient(transport: MemoryTransport) {
  return Object.freeze({
    async retrieve(query: MemoryQuery, signal?: AbortSignal): Promise<MemoryRetrieval> {
      const validated = memoryQuerySchema.parse(query);
      signal?.throwIfAborted();
      const result = memoryRetrievalSchema.parse(await transport({version: 1, query: validated}, signal));
      signal?.throwIfAborted();
      const now = Date.now();
      if (result.memories.some(({approval}) => approval.approvedAt > now || (approval.expiresAt !== null && approval.expiresAt <= now))) {
        throw new Error('Memory approval expired or is invalid.');
      }
      return result;
    },
  });
}
export type MemoryClient = ReturnType<typeof createMemoryClient>;
