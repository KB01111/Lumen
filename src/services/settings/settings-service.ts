import type {AppearanceSettings} from '../../state/appearance.schema';

export type SettingsOperation = 'read' | 'write';
export type SettingsErrorCode =
  | 'settings-read-failed'
  | 'settings-write-failed'
  | 'settings-invalid';

export interface SettingsFailure {
  code: SettingsErrorCode;
  message: string;
  operation: SettingsOperation;
  recoverable: true;
}

export type SettingsWriteResult =
  | {ok: true}
  | {ok: false; error: SettingsFailure};

export interface SettingsService {
  readAppearance(): Promise<AppearanceSettings>;
  writeAppearance(value: AppearanceSettings): Promise<SettingsWriteResult>;
}

export type SettingsFailureReporter = (failure: SettingsFailure) => void;

