import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';

import type {WindowMode} from '../../platform/window/window-service';

export type LauncherFocusRegion = 'search' | 'scope' | 'results' | 'preview';
export type LauncherIntent = 'search' | 'computer';

interface LauncherData {
  mode: WindowMode;
  visible: boolean;
  focusRegion: LauncherFocusRegion;
  intent: LauncherIntent;
}

interface LauncherActions {
  show(mode: WindowMode): void;
  hide(): void;
  setMode(mode: WindowMode): void;
  setFocusRegion(region: LauncherFocusRegion): void;
  setIntent(intent: LauncherIntent): void;
  reset(): void;
}

export type LauncherStore = LauncherData & LauncherActions;

const initialLauncherData: LauncherData = {
  mode: 'collapsed',
  visible: true,
  focusRegion: 'search',
  intent: 'search',
};

export const useLauncherStore = create<LauncherStore>()(
  subscribeWithSelector((set) => ({
    ...initialLauncherData,
    show: (mode) => set({mode, visible: true}),
    hide: () => set({visible: false}),
    setMode: (mode) => set({mode}),
    setFocusRegion: (focusRegion) => set({focusRegion}),
    setIntent: (intent) => set({intent, focusRegion: 'search'}),
    reset: () => set(initialLauncherData),
  })),
);

export const selectLauncherMode = (state: LauncherStore) => state.mode;
export const selectLauncherVisible = (state: LauncherStore) => state.visible;
export const selectLauncherFocusRegion = (state: LauncherStore) => state.focusRegion;

