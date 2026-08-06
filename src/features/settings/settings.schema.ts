import {z} from 'zod';

import {searchRecencySchema, searchScopeSchema} from '../../services/search/search.types';

import {computerUseModelSchema} from '../../services/computer-use/computer-use.types';

export const settingsPageIds = [
  'general',
  'appearance',
  'indexed-roots',
  'search',
  'local-ai',
  'agent-gateway',
  'computer-use',
  'activity',
  'session-relief',
  'privacy',
  'diagnostics',
] as const;

export const settingsPageIdSchema = z.enum(settingsPageIds);
export type SettingsPageId = z.infer<typeof settingsPageIdSchema>;

export const indexedRootSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(3),
  paused: z.boolean(),
  exclusions: z.array(z.string()),
  includeHidden: z.boolean(),
  maxFileSizeMb: z.number().int().min(1).max(10_240),
  status: z.enum(['ready', 'indexing', 'paused', 'error']),
});

export type IndexedRoot = z.infer<typeof indexedRootSchema>;

export const applicationOverrideSchema = z.object({
  id: z.string().min(1),
  application: z.string().min(1),
  policy: z.enum(['automatic', 'pause', 'cinema', 'allow']),
});

export type ApplicationOverride = z.infer<typeof applicationOverrideSchema>;

const defaultAiSettings = {
  runtimeMode: 'auto' as const,
  keepLocalWarm: false,
  cloudAnswerConsent: false,
  cloudEnrichedRootIds: [] as string[],
};

const defaultComputerUseSettings = {
  model: 'gemini-3.6-flash' as const,
  initialUrl: 'https://www.google.com',
  cloudConsent: false,
};

export const settingsSchema = z.object({
  activePage: settingsPageIdSchema.default('general'),
  general: z.object({
    launchAtStartup: z.boolean(),
    shortcut: z.string().min(3),
    monitorBehavior: z.enum(['active', 'primary']),
    historyEnabled: z.boolean(),
    closeBehavior: z.enum(['hide', 'quit']),
  }),
  presentation: z.object({
    glassIntensity: z.number().int().min(0).max(100),
    synchronizeReducedMotion: z.boolean(),
  }),
  roots: z.array(indexedRootSchema),
  search: z.object({
    enabledScopes: z.array(searchScopeSchema).min(1),
    filenamePriority: z.number().int().min(0).max(100),
    recency: searchRecencySchema,
  }),
  ai: z.object({
    runtimeMode: z.enum(['auto', 'local', 'cloud']),
    keepLocalWarm: z.boolean(),
    cloudAnswerConsent: z.boolean().default(false),
    cloudEnrichedRootIds: z.array(z.string().min(1)),
  }).default(defaultAiSettings),
  computerUse: z.object({
    model: computerUseModelSchema,
    initialUrl: z.url().refine((value) => value.startsWith('https://') || value.startsWith('http://')),
    cloudConsent: z.boolean(),
  }).default(defaultComputerUseSettings),
  activity: z.object({
    detectGames: z.boolean(),
    detectFullscreen: z.boolean(),
    allowDuringVideo: z.boolean(),
    cinemaMetadataOnly: z.boolean(),
    pauseOnBattery: z.boolean(),
    resumeDelaySeconds: z.number().int().min(0).max(600),
    overrides: z.array(applicationOverrideSchema),
    userGames: z.array(z.string()),
  }),
  privacy: z.object({
    previewsEnabled: z.boolean(),
  }),
});

export type LumenSettings = z.infer<typeof settingsSchema>;
export type GeneralSettings = LumenSettings['general'];
export type PresentationSettings = LumenSettings['presentation'];
export type SearchSettings = LumenSettings['search'];
export type AiSettings = LumenSettings['ai'];
export type ComputerUseSettings = LumenSettings['computerUse'];
export type ActivitySettings = LumenSettings['activity'];
export type PrivacySettings = LumenSettings['privacy'];

export const defaultSettings: LumenSettings = settingsSchema.parse({
  activePage: 'general',
  general: {
    launchAtStartup: false,
    shortcut: 'Alt + Space',
    monitorBehavior: 'active',
    historyEnabled: true,
    closeBehavior: 'hide',
  },
  presentation: {
    glassIntensity: 72,
    synchronizeReducedMotion: true,
  },
  roots: [],
  search: {
    enabledScopes: ['all', 'files', 'folders', 'documents', 'code', 'images', 'recent', 'related'],
    filenamePriority: 82,
    recency: 'balanced',
  },
  ai: defaultAiSettings,
  computerUse: defaultComputerUseSettings,
  activity: {
    detectGames: true,
    detectFullscreen: true,
    allowDuringVideo: false,
    cinemaMetadataOnly: true,
    pauseOnBattery: true,
    resumeDelaySeconds: 30,
    overrides: [],
    userGames: [],
  },
  privacy: {
    previewsEnabled: true,
  },
});

export function parseSettings(value: unknown): LumenSettings {
  const result = settingsSchema.safeParse(value);
  if (!result.success) return defaultSettings;
  if (result.data.ai.cloudAnswerConsent) return result.data;
  return {
    ...result.data,
    ai: {
      ...result.data.ai,
      cloudEnrichedRootIds: [],
      runtimeMode: result.data.ai.runtimeMode === 'cloud' ? 'local' : result.data.ai.runtimeMode,
    },
  };
}
