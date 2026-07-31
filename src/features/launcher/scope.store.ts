import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';

import type {SearchFilter, SearchScope} from '../../services/search/search.types';

interface ScopeData {
  activeScope: SearchScope;
  activeFilters: readonly SearchFilter[];
}

interface ScopeActions {
  setScope(scope: SearchScope): void;
  toggleFilter(filter: SearchFilter): void;
  clearFilters(): void;
  reset(): void;
}

export type ScopeStore = ScopeData & ScopeActions;

const initialScopeData: ScopeData = {
  activeScope: 'all',
  activeFilters: [],
};

export const useScopeStore = create<ScopeStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialScopeData,
    setScope: (activeScope) => set({activeScope}),
    toggleFilter: (filter) => {
      const current = get().activeFilters;
      const isActive = current.some((item) => item.id === filter.id);
      set({
        activeFilters: isActive
          ? current.filter((item) => item.id !== filter.id)
          : [...current, filter],
      });
    },
    clearFilters: () => set({activeFilters: []}),
    reset: () => set(initialScopeData),
  })),
);

export const selectActiveScope = (state: ScopeStore) => state.activeScope;
export const selectActiveFilters = (state: ScopeStore) => state.activeFilters;

