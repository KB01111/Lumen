import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';

export type SelectionRegion = 'search' | 'scope' | 'results' | 'preview';

interface SelectionData {
  selectedId: string | null;
  focusedRegion: SelectionRegion;
}

interface SelectionActions {
  select(fileId: string | null): void;
  focusRegion(region: SelectionRegion): void;
  clear(): void;
  reset(): void;
}

export type SelectionStore = SelectionData & SelectionActions;

const initialSelectionData: SelectionData = {
  selectedId: null,
  focusedRegion: 'search',
};

let intendedSelectedId: string | null = null;

export const useSelectionStore = create<SelectionStore>()(
  subscribeWithSelector((set) => ({
    ...initialSelectionData,
    select: (selectedId) => {
      intendedSelectedId = selectedId;
      set({selectedId});
    },
    focusRegion: (focusedRegion) => set({focusedRegion}),
    clear: () => {
      intendedSelectedId = null;
      set({selectedId: null});
    },
    reset: () => {
      intendedSelectedId = null;
      set(initialSelectionData);
    },
  })),
);

export function rememberSelectionIntent(selectedId: string | null) {
  intendedSelectedId = selectedId;
}

export function readSelectionIntent() {
  return intendedSelectedId;
}

export const selectSelectedId = (state: SelectionStore) => state.selectedId;
export const selectFocusedRegion = (state: SelectionStore) => state.focusedRegion;
