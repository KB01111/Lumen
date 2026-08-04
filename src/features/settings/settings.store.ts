import {LazyStore} from '@tauri-apps/plugin-store';
import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';

import {
  defaultSettings,
  parseSettings,
  settingsSchema,
  type AiSettings,
  type ActivitySettings,
  type GeneralSettings,
  type IndexedRoot,
  type LumenSettings,
  type PresentationSettings,
  type PrivacySettings,
  type SearchSettings,
  type SettingsPageId,
} from './settings.schema';

export type SettingsPersistenceStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'saved' | 'error';

interface SettingsMeta {
  hydrated: boolean;
  persistenceStatus: SettingsPersistenceStatus;
  persistenceError: string | null;
}

interface SettingsActions {
  hydrate(): Promise<void>;
  reset(): void;
  setActivePage(page: SettingsPageId): void;
  updateGeneral(patch: Partial<GeneralSettings>): Promise<boolean>;
  updatePresentation(patch: Partial<PresentationSettings>): Promise<boolean>;
  setRoots(roots: IndexedRoot[]): Promise<boolean>;
  updateSearch(patch: Partial<SearchSettings>): Promise<boolean>;
  updateAi(patch: Partial<AiSettings>): Promise<boolean>;
  updateActivity(patch: Partial<ActivitySettings>): Promise<boolean>;
  updatePrivacy(patch: Partial<PrivacySettings>): Promise<boolean>;
}

export type SettingsState = LumenSettings & SettingsMeta & SettingsActions;

const browserStorageKey = 'lumen-management-settings';
const nativeStore = new LazyStore('lumen.settings.json', {autoSave: false});

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function readSettings() {
  try {
    if (isTauriRuntime()) {
      return parseSettings(await nativeStore.get<unknown>('management'));
    }
    const raw = window.localStorage.getItem(browserStorageKey);
    return raw ? parseSettings(JSON.parse(raw)) : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

async function writeSettings(settings: LumenSettings) {
  if (isTauriRuntime()) {
    await nativeStore.set('management', settings);
    await nativeStore.save();
    return;
  }
  window.localStorage.setItem(browserStorageKey, JSON.stringify(settings));
}

function stateSettings(state: SettingsState): LumenSettings {
  return settingsSchema.parse({
    activePage: state.activePage,
    general: state.general,
    presentation: state.presentation,
    roots: state.roots,
    search: state.search,
    ai: state.ai,
    activity: state.activity,
    privacy: state.privacy,
  });
}

const initialMeta: SettingsMeta = {
  hydrated: false,
  persistenceStatus: 'idle',
  persistenceError: null,
};

export const useSettingsStore = create<SettingsState>()(
  subscribeWithSelector((set, get) => {
    let writeRevision = 0;

    async function persist() {
      const revision = ++writeRevision;
      set({persistenceStatus: 'saving', persistenceError: null});
      try {
        await writeSettings(stateSettings(get()));
        if (revision === writeRevision) {
          set({persistenceStatus: 'saved'});
        }
        return true;
      } catch (error) {
        if (revision === writeRevision) {
          set({
            persistenceStatus: 'error',
            persistenceError: error instanceof Error ? error.message : 'Settings could not be saved.',
          });
        }
        return false;
      }
    }

    return {
      ...defaultSettings,
      ...initialMeta,
      hydrate: async () => {
        if (get().hydrated) {
          return;
        }
        set({persistenceStatus: 'loading'});
        const settings = await readSettings();
        set({...settings, hydrated: true, persistenceStatus: 'ready'});
      },
      reset: () => {
        writeRevision += 1;
        set({...defaultSettings, ...initialMeta});
      },
      setActivePage: (activePage) => {
        set({activePage});
        void persist();
      },
      updateGeneral: (patch) => {
        set((state) => ({general: {...state.general, ...patch}}));
        return persist();
      },
      updatePresentation: (patch) => {
        set((state) => ({presentation: {...state.presentation, ...patch}}));
        return persist();
      },
      setRoots: (roots) => {
        set({roots});
        return persist();
      },
      updateSearch: (patch) => {
        set((state) => ({search: {...state.search, ...patch}}));
        return persist();
      },
      updateAi: (patch) => {
        set((state) => ({ai: {...state.ai, ...patch}}));
        return persist();
      },
      updateActivity: (patch) => {
        set((state) => ({activity: {...state.activity, ...patch}}));
        return persist();
      },
      updatePrivacy: (patch) => {
        set((state) => ({privacy: {...state.privacy, ...patch}}));
        return persist();
      },
    };
  }),
);
