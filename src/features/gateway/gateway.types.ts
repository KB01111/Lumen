export type HardwareState = 'npu' | 'gpu' | 'cpu' | 'unavailable';
export type ModelState = 'missing' | 'downloading' | 'loading' | 'ready' | 'failed' | 'fallback-active';
export type GatewayState = 'starting' | 'ready' | 'unavailable' | 'restarting';
export type ProviderStatus = 'ready' | 'degraded' | 'unavailable';
export type McpStatus = 'connected' | 'testing' | 'unavailable';
export type ToolAccess = 'ask' | 'allow' | 'deny';

export interface LocalAiViewModel {
  hardware: HardwareState;
  state: ModelState;
  progress?: number;
  modelName?: string;
  provider?: string;
  message?: string;
}

export interface ProviderRoute {
  id: string;
  alias: string;
  providerId: string;
  status: ProviderStatus;
  cloud: boolean;
}

export interface McpService {
  id: string;
  name: string;
  status: McpStatus;
  toolCount: number;
}

export interface ToolPermission {
  id: string;
  label: string;
  description: string;
  access: ToolAccess;
}
