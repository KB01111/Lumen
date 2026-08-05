import {z} from 'zod';

export const computerUseModels = [
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-2.5-computer-use-preview-10-2025',
  'gemini-3-flash-preview',
] as const;

export const computerUseModelSchema = z.enum(computerUseModels);
export type ComputerUseModel = z.infer<typeof computerUseModelSchema>;

export interface ComputerUseRequest {
  taskId: number;
  task: string;
  model: ComputerUseModel;
  initialUrl: string;
  cloudConsent: boolean;
}

export const computerUseEventSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('started'), model: z.string(), browser: z.string()}),
  z.object({type: z.literal('reasoning'), text: z.string()}),
  z.object({type: z.literal('action'), action: z.string()}),
  z.object({type: z.literal('observation'), url: z.string()}),
  z.object({
    type: z.literal('approvalRequired'),
    approvalId: z.string().min(1),
    explanation: z.string().min(1),
  }),
  z.object({
    type: z.literal('approvalResolved'),
    approvalId: z.string().min(1),
    approved: z.boolean(),
  }),
  z.object({type: z.literal('completed'), summary: z.string()}),
  z.object({type: z.literal('cancelled')}),
  z.object({type: z.literal('failed'), message: z.string(), code: z.string()}),
]);

export type ComputerUseEvent = z.infer<typeof computerUseEventSchema>;

export const computerUseHealthSchema = z.object({
  state: z.enum(['ready', 'unavailable']),
  mode: z.enum(['packaged', 'python', 'missing']),
  browser: z.string(),
  credentialConfigured: z.boolean(),
  detail: z.string().optional(),
});

export type ComputerUseHealth = z.infer<typeof computerUseHealthSchema>;
