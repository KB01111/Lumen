import {z} from 'zod';

export type RuntimeMode = 'auto' | 'local' | 'cloud';

export const answerRequestSchema = z.object({
  requestId: z.number().int().positive(),
  query: z.string().trim().min(1).max(4_000),
  mode: z.enum(['auto', 'local', 'cloud']),
  cloudConsent: z.boolean(),
});

export type AnswerRequest = z.infer<typeof answerRequestSchema>;

export const answerCitationSchema = z.object({
  fileId: z.string().min(1),
  label: z.string().min(1),
  page: z.number().int().positive().optional(),
  timestampSeconds: z.number().finite().nonnegative().optional(),
});

export type AnswerCitation = z.infer<typeof answerCitationSchema>;

export const answerUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  remainingTokens: z.number().int().nonnegative().optional(),
  resetAt: z.string().min(1).optional(),
});

export type AnswerUsage = z.infer<typeof answerUsageSchema>;

export const answerEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('started'),
    provider: z.string().min(1),
    model: z.string().min(1),
    route: z.string().min(1),
  }),
  z.object({type: z.literal('citation'), citation: answerCitationSchema}),
  z.object({type: z.literal('delta'), text: z.string()}),
  z.object({type: z.literal('usage'), usage: answerUsageSchema}),
  z.object({
    type: z.literal('completed'),
    provider: z.string().min(1),
    model: z.string().min(1),
    route: z.string().min(1),
  }),
  z.object({type: z.literal('cancelled')}),
  z.object({type: z.literal('failed'), message: z.string().min(1), code: z.string().min(1).optional()}),
]);

export type AnswerEvent = z.infer<typeof answerEventSchema>;

