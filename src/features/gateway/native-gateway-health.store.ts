import {create} from 'zustand';

import type {EnrichmentHealth, GatewayHealth} from '../../services/ai/native-ai-service';

interface NativeGatewayHealthState {
  gateway: GatewayHealth | null;
  enrichment: EnrichmentHealth | null;
  setHealth(gateway: GatewayHealth | null, enrichment: EnrichmentHealth | null): void;
  reset(): void;
}

/**
 * A native-only health sample shared by the management and diagnostics views.
 * Browser preview data remains in gateway.store.ts.
 */
export const useNativeGatewayHealthStore = create<NativeGatewayHealthState>()((set) => ({
  gateway: null,
  enrichment: null,
  setHealth: (gateway, enrichment) => set({gateway, enrichment}),
  reset: () => set({gateway: null, enrichment: null}),
}));
