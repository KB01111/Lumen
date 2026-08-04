import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';

import type {
  GatewayState,
  HardwareState,
  LocalAiViewModel,
  McpService,
  ModelState,
  ProviderRoute,
  ToolAccess,
  ToolPermission,
} from './gateway.types';

interface GatewayData {
  hardwareState: HardwareState;
  modelState: ModelState;
  modelProgress: number;
  modelName: string;
  providerName: string;
  gatewayState: GatewayState;
  routes: ProviderRoute[];
  mcpServices: McpService[];
  permissions: ToolPermission[];
  actionMessage: string;
}

interface GatewayActions {
  reset(): void;
  setLocalAi(model: Partial<LocalAiViewModel>): void;
  setRouteProvider(routeId: string, providerId: string): void;
  setPermission(id: string, access: ToolAccess): void;
  restart(): Promise<void>;
  testProvider(routeId: string): Promise<void>;
  testMcp(id: string): Promise<void>;
}

export type GatewayStore = GatewayData & GatewayActions;

const initialGatewayData: GatewayData = {
  hardwareState: 'unavailable',
  modelState: 'missing',
  modelProgress: 0,
  modelName: 'Lumen Mini 3B',
  providerName: 'No local provider connected',
  gatewayState: 'unavailable',
  routes: [
    {id: 'fast', alias: 'lumen.fast', providerId: 'local-cpu', status: 'degraded', cloud: false},
    {id: 'deep', alias: 'lumen.deep', providerId: 'cloud-preview', status: 'unavailable', cloud: true},
  ],
  mcpServices: [
    {id: 'files', name: 'Files MCP', status: 'connected', toolCount: 3},
    {id: 'windows', name: 'Windows MCP', status: 'unavailable', toolCount: 0},
  ],
  permissions: [
    {id: 'read-files', label: 'Read file metadata', description: 'Allow local metadata reads inside indexed roots.', access: 'allow'},
    {id: 'open-files', label: 'Open files', description: 'Ask before a provider opens a selected file.', access: 'ask'},
    {id: 'network', label: 'Network access', description: 'Block tools from reaching network resources.', access: 'deny'},
  ],
  actionMessage: '',
};

const providers = {
  'local-cpu': {cloud: false, status: 'degraded'},
  'windows-local': {cloud: false, status: 'ready'},
  'cloud-preview': {cloud: true, status: 'unavailable'},
} as const;

export const useGatewayStore = create<GatewayStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialGatewayData,
    reset: () => set(initialGatewayData),
    setLocalAi: (model) => set((state) => ({
      hardwareState: model.hardware ?? state.hardwareState,
      modelState: model.state ?? state.modelState,
      modelProgress: model.progress ?? state.modelProgress,
      modelName: model.modelName ?? state.modelName,
      providerName: model.provider ?? state.providerName,
    })),
    setRouteProvider: (routeId, providerId) => {
      const provider = providers[providerId as keyof typeof providers];
      if (!provider) return;
      set((state) => ({
        routes: state.routes.map((route) => route.id === routeId
          ? {...route, providerId, cloud: provider.cloud, status: provider.status}
          : route),
        actionMessage: `${get().routes.find((route) => route.id === routeId)?.alias ?? 'Route'} now points to ${providerId}.`,
      }));
    },
    setPermission: (id, access) => set((state) => ({
      permissions: state.permissions.map((permission) => permission.id === id ? {...permission, access} : permission),
    })),
    restart: async () => {
      set({gatewayState: 'restarting', actionMessage: 'Restarting AgentGateway preview…'});
      await Promise.resolve();
      set({gatewayState: 'ready', actionMessage: 'AgentGateway preview restarted.'});
    },
    testProvider: async (routeId) => {
      await Promise.resolve();
      const route = get().routes.find((item) => item.id === routeId);
      set({actionMessage: routeId === 'fast'
        ? 'Local provider preview responded in 18 ms.'
        : `${route?.alias ?? 'Provider'} preview is unavailable without cloud consent.`});
    },
    testMcp: async (id) => {
      set((state) => ({
        mcpServices: state.mcpServices.map((service) => service.id === id ? {...service, status: 'testing'} : service),
      }));
      await Promise.resolve();
      const service = get().mcpServices.find((item) => item.id === id);
      set((state) => ({
        mcpServices: state.mcpServices.map((item) => item.id === id ? {...item, status: service?.toolCount ? 'connected' : 'unavailable'} : item),
        actionMessage: service?.toolCount
          ? `${service.name} preview exposed ${service.toolCount} tools.`
          : `${service?.name ?? 'MCP'} preview is unavailable.`,
      }));
    },
  })),
);
