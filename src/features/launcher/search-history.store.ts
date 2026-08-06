import {LazyStore} from '@tauri-apps/plugin-store';
import {z} from 'zod';
import {create} from 'zustand';

export const MAX_SEARCH_HISTORY_ENTRIES = 25;
export const MAX_SEARCH_HISTORY_QUERY_LENGTH = 240;

export const searchHistoryEntrySchema = z.object({
  query: z.string().trim().min(1).max(MAX_SEARCH_HISTORY_QUERY_LENGTH),
  openedAt: z.number().int().nonnegative(),
});
export type SearchHistoryEntry = z.infer<typeof searchHistoryEntrySchema>;

const persistedHistorySchema = z.object({entries: z.array(searchHistoryEntrySchema)});
const browserStorageKey = 'lumen-search-history-v1';
const nativeStore = new LazyStore('lumen.search-history.json', {autoSave: false});

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function historyKey(query: string) {
  return query.toLocaleLowerCase();
}

export function normalizeHistoryEntries(entries: readonly SearchHistoryEntry[]): SearchHistoryEntry[] {
  const seen = new Set<string>();
  return [...entries]
    .sort((left, right) => right.openedAt - left.openedAt)
    .filter((entry) => {
      const key = historyKey(entry.query);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_SEARCH_HISTORY_ENTRIES);
}

async function readHistory(): Promise<SearchHistoryEntry[]> {
  try {
    const raw = isTauriRuntime()
      ? await nativeStore.get<unknown>('entries')
      : JSON.parse(window.localStorage.getItem(browserStorageKey) ?? 'null');
    const parsed = persistedHistorySchema.safeParse(isTauriRuntime() ? {entries: raw ?? []} : raw);
    return parsed.success ? normalizeHistoryEntries(parsed.data.entries) : [];
  } catch {
    return [];
  }
}

async function restoreNativeEntries(entries: readonly SearchHistoryEntry[]) {
  if (entries.length > 0) {
    await nativeStore.set('entries', entries);
  } else {
    await nativeStore.delete('entries');
  }
  await nativeStore.save();
}

async function writeHistory(entries: readonly SearchHistoryEntry[], previousEntries: readonly SearchHistoryEntry[] = []) {
  if (isTauriRuntime()) {
    await nativeStore.set('entries', entries);
    try {
      await nativeStore.save();
    } catch (error) {
      try {
        await restoreNativeEntries(previousEntries);
      } catch {
        // The prior value is still staged even if its repair save cannot complete.
      }
      throw error;
    }
    return;
  }
  window.localStorage.setItem(browserStorageKey, JSON.stringify({entries}));
}

async function clearHistory(previousEntries: readonly SearchHistoryEntry[] = []) {
  if (isTauriRuntime()) {
    await nativeStore.delete('entries');
    try {
      await nativeStore.save();
    } catch (error) {
      try {
        await restoreNativeEntries(previousEntries);
      } catch {
        // The prior value is still staged even if its repair save cannot complete.
      }
      throw error;
    }
    return;
  }
  window.localStorage.removeItem(browserStorageKey);
}

export const searchHistoryPersistence = {
  clear: clearHistory,
  read: readHistory,
  write: writeHistory,
};

interface SearchHistoryState {
  entries: SearchHistoryEntry[];
  hydrated: boolean;
  hydrate(): Promise<void>;
  record(query: string): Promise<boolean>;
  clear(): Promise<boolean>;
  reset(): void;
}

const initialState = {entries: [] as SearchHistoryEntry[], hydrated: false};

export const useSearchHistoryStore = create<SearchHistoryState>((set, get) => {
  let persistenceQueue = Promise.resolve();
  let hydration: Promise<void> | null = null;

  const enqueue = (operation: () => Promise<boolean>) => {
    const next = persistenceQueue.then(operation);
    persistenceQueue = next.then(() => undefined, () => undefined);
    return next;
  };

  const ensureHydrated = () => {
    if (get().hydrated) return Promise.resolve();
    if (!hydration) {
      const pending = persistenceQueue.then(async () => {
        const entries = await searchHistoryPersistence.read();
        if (!get().hydrated) set({entries, hydrated: true});
      });
      persistenceQueue = pending.then(() => undefined, () => undefined);
      hydration = pending.finally(() => { hydration = null; });
    }
    return hydration;
  };

  return {
    ...initialState,
    hydrate: ensureHydrated,
    record: async (candidate) => {
      await ensureHydrated();
      return enqueue(async () => {
      const parsed = searchHistoryEntrySchema.safeParse({query: candidate, openedAt: Date.now()});
      if (!parsed.success) return false;
      const current = get().entries;
      const next = normalizeHistoryEntries([
        parsed.data,
        ...current.filter((entry) => historyKey(entry.query) !== historyKey(parsed.data.query)),
      ]);
      try {
        await searchHistoryPersistence.write(next, current);
        set({entries: next});
        return true;
      } catch {
        return false;
      }
      });
    },
    clear: async () => {
      await ensureHydrated();
      return enqueue(async () => {
      const current = get().entries;
      try {
        await searchHistoryPersistence.clear(current);
        set({entries: []});
        return true;
      } catch {
        return false;
      }
      });
    },
    reset: () => set(initialState),
  };
});
