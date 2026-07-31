import {LazyStore} from '@tauri-apps/plugin-store';

import {
  appearanceSchema,
  defaultAppearanceSettings,
  type AppearanceSettings,
} from '../../state/appearance.schema';
import type {
  SettingsFailure,
  SettingsFailureReporter,
  SettingsService,
  SettingsWriteResult,
} from './settings-service';

const appearanceKey = 'appearance';

function failure(
  operation: SettingsFailure['operation'],
  message: string,
  code: SettingsFailure['code'],
): SettingsFailure {
  return {code, message, operation, recoverable: true};
}

export class TauriSettingsService implements SettingsService {
  private readonly store = new LazyStore('lumen.settings.json', {autoSave: false});

  constructor(private readonly reportFailure?: SettingsFailureReporter) {}

  async readAppearance(): Promise<AppearanceSettings> {
    try {
      const persistedValue = await this.store.get<unknown>(appearanceKey);
      if (persistedValue === undefined) {
        return defaultAppearanceSettings;
      }

      const result = appearanceSchema.safeParse(persistedValue);
      if (!result.success) {
        this.reportFailure?.(
          failure('read', 'Saved appearance preferences were invalid.', 'settings-invalid'),
        );
        return defaultAppearanceSettings;
      }

      return result.data;
    } catch {
      this.reportFailure?.(
        failure('read', 'Native appearance preferences could not be read.', 'settings-read-failed'),
      );
      return defaultAppearanceSettings;
    }
  }

  async writeAppearance(value: AppearanceSettings): Promise<SettingsWriteResult> {
    const result = appearanceSchema.safeParse(value);
    if (!result.success) {
      const error = failure(
        'write',
        'Appearance preferences did not pass validation.',
        'settings-invalid',
      );
      this.reportFailure?.(error);
      return {ok: false, error};
    }

    try {
      await this.store.set(appearanceKey, result.data);
      await this.store.save();
      return {ok: true};
    } catch {
      const error = failure(
        'write',
        'Native appearance preferences could not be saved.',
        'settings-write-failed',
      );
      this.reportFailure?.(error);
      return {ok: false, error};
    }
  }
}

