import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';

import type {ActivityMode} from './activity.types';

interface ActivityData {
  active: boolean;
  mode: ActivityMode;
  detectedApplication: string | null;
  message: string;
}

interface ActivityActions {
  reset(): void;
  resetClassifications(): void;
  setMode(mode: ActivityMode, application?: string): void;
  toggleUserPause(): void;
}

export type ActivityStore = ActivityData & ActivityActions;

const initialActivityData: ActivityData = {
  active: false,
  mode: 'indexing',
  detectedApplication: null,
  message: '',
};

export const useActivityStore = create<ActivityStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialActivityData,
    reset: () => set(initialActivityData),
    resetClassifications: () => set({
      active: false,
      mode: 'indexing',
      detectedApplication: null,
      message: 'Automatic classifications reset.',
    }),
    setMode: (mode, detectedApplication) => set({
      active: true,
      mode,
      detectedApplication: detectedApplication ?? null,
      message: '',
    }),
    toggleUserPause: () => set(get().active && get().mode === 'user'
      ? {active: false, mode: 'indexing', message: 'Background indexing resumed.'}
      : {active: true, mode: 'user', message: 'Background indexing paused.'}),
  })),
);
