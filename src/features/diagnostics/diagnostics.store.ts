import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';

import {useActivityStore} from '../activity/activity.store';
import {activityPresentations} from '../activity/activity.types';
import {useGatewayStore} from '../gateway/gateway.store';
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
  return {
    appVersion: '0.1.0',
    webViewVersion: webViewVersion(),
    tauriVersion: 'Tauri 2 frontend contract',
    monitor: currentMonitor(),
    dpiScale: typeof window === 'undefined' ? 1 : window.devicePixelRatio,
    refreshRateHz,
    activeAnimations: activeAnimationCount(),
    ...readDiagnosticMetrics(),
    activity: activityPresentations[activity.mode].label,
    gateway: gateway.gatewayState,
    providerRoutes: gateway.routes.map((route) => `${route.alias} → ${route.providerId} (${route.status})`),
  };
}

interface DiagnosticsState {
  overlayOpen: boolean;
  snapshot: DiagnosticsSnapshot;
  lastExport: DiagnosticsExport | null;
  refresh(): void;
  sampleRefreshRate(): Promise<number>;
  prepareExport(): DiagnosticsExport;
  setOverlay(open: boolean): void;
  toggleOverlay(): void;
  reset(): void;
}

const initialSnapshot = buildSnapshot();

export const useDiagnosticsStore = create<DiagnosticsState>()(
  subscribeWithSelector((set, get) => ({
    overlayOpen: false,
    snapshot: initialSnapshot,
    lastExport: null,
    refresh: () => set({snapshot: buildSnapshot(get().snapshot.refreshRateHz)}),
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
      resetDiagnosticMetrics();
      set({overlayOpen: false, snapshot: buildSnapshot(), lastExport: null});
    },
  })),
);
