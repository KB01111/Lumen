import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';

import type {ActivityMode} from './activity.types';

interface ActivityData {
  active: boolean;
  manualPauseActive: boolean;
  mode: ActivityMode;
  detectedApplication: string | null;
  message: string;
}

interface ActivityActions {
  reset(): void;
  resetClassifications(): void;
  setMode(mode: ActivityMode, application?: string): void;
  setUserPaused(paused: boolean): void;
}

export type ActivityStore = ActivityData & ActivityActions;

const initialActivityData: ActivityData = {
  active: false,
  manualPauseActive: false,
  mode: 'indexing',
  detectedApplication: null,
  message: '',
};

export const useActivityStore = create<ActivityStore>()(
  subscribeWithSelector((set) => ({
    ...initialActivityData,
    reset: () => set(initialActivityData),
    resetClassifications: () => set((state) => state.manualPauseActive
      ? {message: 'Manual background pause remains active.'}
      : {
          active: false,
          mode: 'indexing',
          detectedApplication: null,
          message: 'Automatic classifications reset.',
        }),
    setMode: (mode, detectedApplication) => set((state) => state.manualPauseActive
      ? {message: 'Resume manual background pause before changing development state.'}
      : {
          active: true,
          mode,
          detectedApplication: detectedApplication ?? null,
          message: '',
        }),
    setUserPaused: (paused) => set(paused
      ? {
          active: true,
          manualPauseActive: true,
          mode: 'user',
          detectedApplication: null,
          message: 'Background indexing and enrichment paused.',
        }
      : {
          active: false,
          manualPauseActive: false,
          mode: 'indexing',
          detectedApplication: null,
          message: 'Background indexing and enrichment resumed.',
        }),
  })),
);
