import type {AppearanceSettings} from '../state/appearance.schema';

export type AppearancePreferences = Pick<
  AppearanceSettings,
  'mode' | 'transparency' | 'effects' | 'motion'
>;

export const defaultAppearance: AppearancePreferences = {
  mode: 'system',
  transparency: 'native',
  effects: 'full',
  motion: 'system',
};

export const themeContracts = {
  light: 'light',
  dark: 'dark',
  opaque: 'opaque',
  highContrast: 'highContrast',
  reducedEffects: 'reducedEffects',
  reducedMotion: 'reducedMotion',
} as const;
