import {
  appearanceSchema,
  defaultAppearanceSettings,
  parseAppearanceSettings,
  type AppearanceSettings,
} from '../../state/appearance.schema';
import type {
  SettingsFailure,
  SettingsFailureReporter,
  SettingsService,
  SettingsWriteResult,
} from './settings-service';

const appearanceKey = 'appearance';

export interface BrowserSettingsBackingStore {
  get(key: string): string | undefined;
  set(key: string, value: string): unknown;
}

function createDefaultBackingStore(): BrowserSettingsBackingStore {
  if (typeof window === 'undefined') {
    return new Map<string, string>();
  }

  return {
    get: (key) => window.localStorage.getItem(key) ?? undefined,
    set: (key, value) => window.localStorage.setItem(key, value),
  };
}

function failure(
  operation: SettingsFailure['operation'],
  message: string,
  code: SettingsFailure['code'],
): SettingsFailure {
  return {code, message, operation, recoverable: true};
}

export class BrowserSettingsService implements SettingsService {
  constructor(
    private readonly backingStore: BrowserSettingsBackingStore = createDefaultBackingStore(),
    private readonly reportFailure?: SettingsFailureReporter,
  ) {}

  async readAppearance(): Promise<AppearanceSettings> {
    try {
      const rawValue = this.backingStore.get(appearanceKey);
      if (rawValue === undefined) {
        return defaultAppearanceSettings;
      }

      const parsedValue: unknown = JSON.parse(rawValue);
      const result = appearanceSchema.safeParse(parsedValue);
      if (!result.success) {
        this.reportFailure?.(
          failure('read', 'Saved appearance preferences were invalid.', 'settings-invalid'),
        );
      }
      return parseAppearanceSettings(parsedValue);
    } catch {
      this.reportFailure?.(
        failure('read', 'Saved appearance preferences could not be read.', 'settings-read-failed'),
      );
      return defaultAppearanceSettings;
    }
  }

  async writeAppearance(value: AppearanceSettings): Promise<SettingsWriteResult> {
    const parsedValue = appearanceSchema.safeParse(value);
    if (!parsedValue.success) {
      const error = failure(
        'write',
        'Appearance preferences did not pass validation.',
        'settings-invalid',
      );
      this.reportFailure?.(error);
      return {ok: false, error};
    }

    try {
      this.backingStore.set(appearanceKey, JSON.stringify(parsedValue.data));
      return {ok: true};
    } catch {
      const error = failure(
        'write',
        'Appearance preferences could not be saved.',
        'settings-write-failed',
      );
      this.reportFailure?.(error);
      return {ok: false, error};
    }
  }
}
