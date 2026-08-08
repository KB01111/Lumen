import {lazy} from 'react';

export const LazyPreviewPane = lazy(async () => ({
  default: (await import('./PreviewPane')).PreviewPane,
}));
