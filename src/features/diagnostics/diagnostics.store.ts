import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';

import {useActivityStore} from '../activity/activity.store';
import {activityPresentations} from '../activity/activity.types';
import {useGatewayStore} from '../gateway/gateway.store';
import {useNativeGatewayHealthStore} from '../gateway/native-gateway-health.store';
import {isNativeRuntime, nativeAiService} from '../../services/ai/native-ai-service';
import {createDiagnosticsExport, type DiagnosticsExport, type DiagnosticsSnapshot} from './diagnostics.types';
import {readDiagnosticMetrics, resetDiagnosticMetrics} from './diagnostics.metrics';

function webViewVersion() {
  const edge = typeof navigator === 'undefined' ? null : navigator.userAgent.match(/Edg\/([\d.]+)/);
  return edge?.[1] ?? 'WebView2 runtime';
}

function currentMonitor() {
  if (typeof screen === 'undefined') return 'Unknown monitor';
  return `${screen.width} × ${screen.height}`;
}

function activeAnimationCount() {
  return typeof document !== 'undefined' && typeof document.getAnimations === 'function'
    ? document.getAnimations().length
    : 0;
}

function buildSnapshot(refreshRateHz = 60): DiagnosticsSnapshot {
  const activity = useActivityStore.getState();
  const gateway = useGatewayStore.getState();
  const nativeGateway = useNativeGatewayHealthStore.getState();
  const native = isNativeRuntime();
  const providerRoutes = native
    ? nativeGateway.gateway
      ? [
          `interactive loopback :${nativeGateway.gateway.interactivePort} (${nativeGateway.gateway.state})`,
          nativeGateway.enrichment
            ? `enrichment processor loopback :${nativeGateway.enrichment.controlPort} (${nativeGateway.enrichment.processorState})`
            : `enrichment processor loopback :${nativeGateway.gateway.enrichmentPort} (unavailable)`,
          nativeGateway.enrichment
            ? `Rivet coordinator loopback :${nativeGateway.enrichment.actorPort} (${nativeGateway.enrichment.coordinatorState})`
            : 'Rivet coordinator loopback (unavailable)',
          `cloud credential (${nativeGateway.gateway.cloudCredentialConfigured ? 'configured' : 'not configured'})`,
        ]
      : ['Native AgentGateway health has not been sampled.']
    : gateway.routes.map((route) => `${route.alias} → ${route.providerId} (${route.status})`);
  return {
    appVersion: '0.1.0',
    webViewVersion: webViewVersion(),
    tauriVersion: 'Tauri 2 frontend contract',
    monitor: currentMonitor(),
    dpiScale: typeof window === 'undefined' ? 1 : window.devicePixelRatio,
    refreshRateHz,
    activeAnimations: activeAnimationCount(),
    ...readDiagnosticMetrics(),
    activity: native
      ? activity.manualPauseActive ? activityPresentations.user.label : 'Manual control available'
      : activityPresentations[activity.mode].label,
    gateway: native ? nativeGateway.gateway?.state ?? 'unavailable' : gateway.gatewayState,
    providerRoutes,
  };
}

interface DiagnosticsState {
  overlayOpen: boolean;
  snapshot: DiagnosticsSnapshot;
  lastExport: DiagnosticsExport | null;
  refresh(): void;
  sampleNativeHealth(): Promise<void>;
  sampleRefreshRate(): Promise<number>;
  prepareExport(): DiagnosticsExport;
  setOverlay(open: boolean): void;
  toggleOverlay(): void;
  reset(): void;
}

const initialSnapshot = buildSnapshot();

export const useDiagnosticsStore = create<DiagnosticsState>()(
  subscribeWithSelector((set, get) => {
    let nativeSampleSequence = 0;
    return {
      overlayOpen: false,
      snapshot: initialSnapshot,
      lastExport: null,
      refresh: () => set({snapshot: buildSnapshot(get().snapshot.refreshRateHz)}),
      sampleNativeHealth: async () => {
        const request = ++nativeSampleSequence;
        if (!isNativeRuntime()) {
          set({snapshot: buildSnapshot(get().snapshot.refreshRateHz)});
          return;
        }
        const [gatewayResult, enrichmentResult] = await Promise.allSettled([
          nativeAiService.gatewayHealth(),
          nativeAiService.enrichmentHealth(),
        ]);
        if (request !== nativeSampleSequence) return;
        useNativeGatewayHealthStore.getState().setHealth(
          gatewayResult.status === 'fulfilled' ? gatewayResult.value : null,
          enrichmentResult.status === 'fulfilled' ? enrichmentResult.value : null,
        );
        set({snapshot: buildSnapshot(get().snapshot.refreshRateHz)});
      },
      sampleRefreshRate: async () => {
      if (typeof requestAnimationFrame !== 'function') return get().snapshot.refreshRateHz;
      const samples: number[] = [];
      let previous = performance.now();
      await new Promise<void>((resolve) => {
        const sample = (now: number) => {
          samples.push(now - previous);
          previous = now;
          if (samples.length >= 24) resolve();
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      const useful = samples.filter((sample) => sample > 0).sort((a, b) => a - b);
      const median = useful[Math.floor(useful.length / 2)] ?? 16.67;
      const refreshRateHz = Math.max(30, Math.min(360, Math.round(1000 / median)));
      set({snapshot: buildSnapshot(refreshRateHz)});
      return refreshRateHz;
      },
      prepareExport: () => {
        const payload = createDiagnosticsExport(get().snapshot);
        set({lastExport: payload});
        return payload;
      },
      setOverlay: (overlayOpen) => {
        if (overlayOpen) set({snapshot: buildSnapshot(get().snapshot.refreshRateHz)});
        set({overlayOpen});
      },
      toggleOverlay: () => get().setOverlay(!get().overlayOpen),
      reset: () => {
        nativeSampleSequence += 1;
        resetDiagnosticMetrics();
        set({overlayOpen: false, snapshot: buildSnapshot(), lastExport: null});
      },
    };
  }),
);
