import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';

interface QueryData {
  draft: string;
  committed: string;
  isComposing: boolean;
}

interface QueryActions {
  setDraft(value: string): void;
  startComposition(): void;
  endComposition(): void;
  commit(): void;
  clear(): void;
  reset(): void;
}

export type QueryStore = QueryData & QueryActions;

const initialQueryData: QueryData = {
  draft: '',
  committed: '',
  isComposing: false,
};

export const useQueryStore = create<QueryStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialQueryData,
    setDraft: (draft) => {
      set(get().isComposing ? {draft} : {draft, committed: draft});
    },
    startComposition: () => set({isComposing: true}),
    endComposition: () => {
      const {draft} = get();
      set({isComposing: false, committed: draft});
    },
    commit: () => set({committed: get().draft}),
    clear: () => set({draft: '', committed: '', isComposing: false}),
    reset: () => set(initialQueryData),
  })),
);

export const selectDraftQuery = (state: QueryStore) => state.draft;
export const selectCommittedQuery = (state: QueryStore) => state.committed;
export const selectIsComposing = (state: QueryStore) => state.isComposing;

