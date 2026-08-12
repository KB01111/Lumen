import {invoke as tauriInvoke} from '@tauri-apps/api/core';
import {z} from 'zod';

type InvokeCommand = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

export const toolIdSchema = z.enum(['files.search', 'files.metadata', 'files.open']);
export const toolAccessSchema = z.enum(['ask', 'allow', 'deny']);
const serviceSchema = z.object({
  id: z.literal('lumen-local'),
  name: z.string().min(1),
  status: z.enum(['connected', 'unavailable']),
  tools: z.array(toolIdSchema),
});
const permissionSchema = z.object({
  id: toolIdSchema,
  label: z.string().min(1),
  description: z.string().min(1),
  access: toolAccessSchema,
});
const registrySchema = z.object({
  services: z.array(serviceSchema),
  permissions: z.array(permissionSchema),
});
const invocationSchema = z.object({
  toolId: toolIdSchema,
  arguments: z.record(z.string(), z.unknown()),
  approvalToken: z.string().regex(/^[a-f0-9]{32}$/).nullable(),
});
const invocationResultSchema = z.object({
  status: z.enum(['approvalRequired', 'completed']),
  approvalToken: z.string().regex(/^[a-f0-9]{32}$/).nullable(),
  message: z.string().min(1),
  result: z.unknown().nullable(),
});

export type McpRegistrySnapshot = z.infer<typeof registrySchema>;
export type ToolId = z.infer<typeof toolIdSchema>;
export type ToolAccess = z.infer<typeof toolAccessSchema>;
export type ToolPermission = z.infer<typeof permissionSchema>;
export type ToolInvocation = z.infer<typeof invocationSchema>;
export type ToolInvocationResult = z.infer<typeof invocationResultSchema>;

export interface McpService {
  list(): Promise<McpRegistrySnapshot>;
  setPermission(toolId: ToolId, access: ToolAccess): Promise<ToolPermission>;
  invoke(invocation: ToolInvocation): Promise<ToolInvocationResult>;
}

export class TauriMcpService implements McpService {
  constructor(private readonly invokeCommand: InvokeCommand = tauriInvoke) {}

  async list() {
    return registrySchema.parse(await this.invokeCommand('list_mcp_services'));
  }

  async setPermission(toolId: ToolId, access: ToolAccess) {
    return permissionSchema.parse(await this.invokeCommand('set_tool_permission', {
      toolId: toolIdSchema.parse(toolId),
      access: toolAccessSchema.parse(access),
    }));
  }

  async invoke(invocation: ToolInvocation) {
    return invocationResultSchema.parse(await this.invokeCommand('invoke_lumen_tool', {
      invocation: invocationSchema.parse(invocation),
    }));
  }
}

export const mcpService = new TauriMcpService();
