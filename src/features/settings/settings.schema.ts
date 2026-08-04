import {z} from 'zod';

export const settingsPageIds = [
  'general',
  'appearance',
  'indexed-roots',
  'search',
  'local-ai',
  'agent-gateway',
  'activity',
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
  cloudEnrichedRootIds: [] as string[],
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
    enabledScopes: z.array(z.enum([
      'all',
      'files',
      'folders',
      'documents',
      'code',
      'images',
      'recent',
      'related',
    ])).min(1),
    filenamePriority: z.number().int().min(0).max(100),
    recency: z.enum(['low', 'balanced', 'high']),
    showPinned: z.boolean(),
    semanticEnabled: z.boolean(),
    rerankingEnabled: z.boolean(),
  }),
  ai: z.object({
    runtimeMode: z.enum(['auto', 'local', 'cloud']),
    keepLocalWarm: z.boolean(),
    cloudEnrichedRootIds: z.array(z.string().min(1)),
  }).default(defaultAiSettings),
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
    ocrEnabled: z.boolean(),
    imageAnalysisEnabled: z.boolean(),
    historyEntries: z.number().int().min(0),
  }),
});

export type LumenSettings = z.infer<typeof settingsSchema>;
export type GeneralSettings = LumenSettings['general'];
export type PresentationSettings = LumenSettings['presentation'];
export type SearchSettings = LumenSettings['search'];
export type AiSettings = LumenSettings['ai'];
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
    showPinned: true,
    semanticEnabled: false,
    rerankingEnabled: false,
  },
  ai: defaultAiSettings,
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
    ocrEnabled: false,
    imageAnalysisEnabled: false,
    historyEntries: 0,
  },
});

export function parseSettings(value: unknown): LumenSettings {
  const result = settingsSchema.safeParse(value);
  return result.success ? result.data : defaultSettings;
}
