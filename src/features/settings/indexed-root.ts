import type {IndexedRoot} from './settings.schema';

export function indexedRootId(path: string) {
  return `root-${path.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

export function createIndexedRoot(path: string): IndexedRoot {
  return {
    id: indexedRootId(path),
    path,
    paused: false,
    exclusions: [],
    includeHidden: false,
    maxFileSizeMb: 256,
    status: 'indexing',
  };
}
