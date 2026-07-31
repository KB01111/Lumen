import {lazy} from 'react';

export const LazyPreviewPane = lazy(async () => {
  const module = await import('./PreviewPane');
  return {default: module.PreviewPane};
});
