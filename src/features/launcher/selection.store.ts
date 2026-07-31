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

export const useSelectionStore = create<SelectionStore>()(
  subscribeWithSelector((set) => ({
    ...initialSelectionData,
    select: (selectedId) => set({selectedId}),
    focusRegion: (focusedRegion) => set({focusedRegion}),
    clear: () => set({selectedId: null}),
    reset: () => set(initialSelectionData),
  })),
);

export const selectSelectedId = (state: SelectionStore) => state.selectedId;
export const selectFocusedRegion = (state: SelectionStore) => state.focusedRegion;

