import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';

import type {SearchError} from '../../services/search/search.types';

export type PreviewStatus = 'idle' | 'loading' | 'ready' | 'error';
export type PreviewMode = 'pane' | 'dialog';

interface PreviewData {
  fileId: string | null;
  mode: PreviewMode;
  status: PreviewStatus;
  error: SearchError | null;
}

interface PreviewActions {
  request(fileId: string, mode?: PreviewMode): void;
  resolve(fileId: string): void;
  fail(fileId: string, error: SearchError): void;
  close(): void;
  reset(): void;
}

export type PreviewStore = PreviewData & PreviewActions;

const initialPreviewData: PreviewData = {
  fileId: null,
  mode: 'pane',
  status: 'idle',
  error: null,
};

export const usePreviewStore = create<PreviewStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialPreviewData,
    request: (fileId, mode = 'pane') =>
      set({fileId, mode, status: 'loading', error: null}),
    resolve: (fileId) => {
      if (get().fileId === fileId) {
        set({status: 'ready', error: null});
      }
    },
    fail: (fileId, error) => {
      if (get().fileId === fileId) {
        set({status: 'error', error});
      }
    },
    close: () => set(initialPreviewData),
    reset: () => set(initialPreviewData),
  })),
);

export const selectPreviewFileId = (state: PreviewStore) => state.fileId;
export const selectPreviewStatus = (state: PreviewStore) => state.status;
export const selectPreviewMode = (state: PreviewStore) => state.mode;

