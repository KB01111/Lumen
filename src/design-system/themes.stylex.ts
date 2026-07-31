import * as stylex from '@stylexjs/stylex';
import {tokens} from './tokens.stylex';

export type AppearanceMode = 'system' | 'light' | 'dark';
export type TransparencyMode = 'native' | 'reduced' | 'disabled';
export type EffectsMode = 'full' | 'reduced';
export type MotionMode = 'system' | 'full' | 'reduced';

export interface AppearancePreferences {
  mode: AppearanceMode;
  transparency: TransparencyMode;
  effects: EffectsMode;
  motion: MotionMode;
}

export const defaultAppearance: AppearancePreferences = {
  mode: 'system',
  transparency: 'native',
  effects: 'full',
  motion: 'system',
};

export const lightTheme = stylex.createTheme(tokens, {
  colorCanvas: '#edf3f7',
  colorCanvasElevated: '#f7fafc',
  colorMaterialBackdrop: 'rgba(242, 248, 252, 0.82)',
  colorMaterialTint: 'rgba(232, 241, 247, 0.72)',
  colorMaterialRaised: 'rgba(255, 255, 255, 0.64)',
  colorMaterialInset: 'rgba(208, 221, 230, 0.34)',
  colorLuminosity: 'rgba(255, 255, 255, 0.46)',
  colorTextPrimary: 'rgba(11, 24, 34, 0.94)',
  colorTextSecondary: 'rgba(29, 48, 63, 0.68)',
  colorTextTertiary: 'rgba(48, 68, 84, 0.48)',
  colorTextDisabled: 'rgba(63, 82, 97, 0.3)',
  colorTextInverse: '#f9fcff',
  colorBorderSubtle: 'rgba(17, 46, 66, 0.1)',
  colorBorderStrong: 'rgba(17, 46, 66, 0.18)',
  colorSpecularTop: 'rgba(255, 255, 255, 0.88)',
  colorInnerEdge: 'rgba(35, 60, 78, 0.18)',
  colorFocus: '#087dc1',
  colorFocusSoft: 'rgba(0, 126, 195, 0.2)',
  colorAccent: '#087fc3',
  colorAccentHover: '#036aa5',
  colorAccentPressed: '#035d91',
  colorAccentMuted: 'rgba(0, 119, 184, 0.12)',
  colorSelection: 'rgba(0, 124, 192, 0.11)',
  colorSelectionStrong: 'rgba(0, 124, 192, 0.18)',
  colorSuccess: '#16784a',
  colorSuccessMuted: 'rgba(22, 120, 74, 0.1)',
  colorWarning: '#8b5d09',
  colorWarningMuted: 'rgba(139, 93, 9, 0.1)',
  colorError: '#bd3434',
  colorErrorMuted: 'rgba(189, 52, 52, 0.1)',
  colorInfo: '#176c9e',
  colorInfoMuted: 'rgba(23, 108, 158, 0.1)',
  shadowAmbient: '0 24px 68px rgba(39, 63, 80, 0.24), 0 6px 20px rgba(39, 63, 80, 0.12)',
  shadowFocused:
    '0 26px 76px rgba(39, 63, 80, 0.28), 0 0 0 1px rgba(0, 112, 176, 0.08), 0 0 32px rgba(0, 126, 195, 0.1)',
  shadowControl: '0 1px 0 rgba(255, 255, 255, 0.7) inset, 0 1px 4px rgba(31, 55, 72, 0.12)',
  shadowInsetTop: 'inset 0 1px 0 rgba(255, 255, 255, 0.74)',
  shadowInsetBottom: 'inset 0 -1px 0 rgba(31, 55, 72, 0.14)',
});

export const darkTheme = stylex.createTheme(tokens, {
  colorCanvas: '#071017',
  colorCanvasElevated: '#0b151f',
});

export const opaqueTheme = stylex.createTheme(tokens, {
  colorLuminosity: 'transparent',
  blurGlass: '0px',
  blurRaised: '0px',
  noiseOpacity: '0',
  luminosityOpacity: '0',
});

export const darkOpaqueMaterialTheme = stylex.createTheme(tokens, {
  colorCanvas: '#071017',
  colorCanvasElevated: '#0b151f',
  colorMaterialBackdrop: '#111c27',
  colorMaterialTint: '#172534',
  colorMaterialRaised: '#223246',
  colorMaterialInset: '#0b141d',
  colorLuminosity: 'transparent',
  shadowAmbient: '0 22px 64px rgba(0, 0, 0, 0.46)',
  shadowFocused: '0 24px 72px rgba(0, 0, 0, 0.5), 0 0 0 2px rgba(111, 199, 255, 0.18)',
  blurGlass: '0px',
  blurRaised: '0px',
  noiseOpacity: '0',
  luminosityOpacity: '0',
});

export const lightOpaqueMaterialTheme = stylex.createTheme(tokens, {
  colorCanvas: '#edf3f7',
  colorCanvasElevated: '#f7fafc',
  colorMaterialBackdrop: '#f4f8fb',
  colorMaterialTint: '#e8f0f5',
  colorMaterialRaised: '#ffffff',
  colorMaterialInset: '#e2ebf1',
  colorLuminosity: 'transparent',
  colorTextPrimary: 'rgba(11, 24, 34, 0.94)',
  colorTextSecondary: 'rgba(29, 48, 63, 0.68)',
  colorTextTertiary: 'rgba(48, 68, 84, 0.48)',
  colorTextDisabled: 'rgba(63, 82, 97, 0.3)',
  colorTextInverse: '#f9fcff',
  colorBorderSubtle: 'rgba(17, 46, 66, 0.1)',
  colorBorderStrong: 'rgba(17, 46, 66, 0.18)',
  colorSpecularTop: 'rgba(255, 255, 255, 0.88)',
  colorInnerEdge: 'rgba(35, 60, 78, 0.18)',
  colorFocus: '#087dc1',
  colorFocusSoft: 'rgba(0, 126, 195, 0.2)',
  colorAccent: '#087fc3',
  colorAccentHover: '#036aa5',
  colorAccentPressed: '#035d91',
  colorAccentMuted: 'rgba(0, 119, 184, 0.12)',
  colorSelection: 'rgba(0, 124, 192, 0.11)',
  colorSelectionStrong: 'rgba(0, 124, 192, 0.18)',
  colorSuccess: '#16784a',
  colorSuccessMuted: 'rgba(22, 120, 74, 0.1)',
  colorWarning: '#8b5d09',
  colorWarningMuted: 'rgba(139, 93, 9, 0.1)',
  colorError: '#bd3434',
  colorErrorMuted: 'rgba(189, 52, 52, 0.1)',
  colorInfo: '#176c9e',
  colorInfoMuted: 'rgba(23, 108, 158, 0.1)',
  shadowAmbient: '0 22px 64px rgba(39, 63, 80, 0.22)',
  shadowFocused: '0 24px 70px rgba(39, 63, 80, 0.25), 0 0 0 2px rgba(0, 124, 192, 0.14)',
  shadowControl: '0 1px 0 rgba(255, 255, 255, 0.7) inset, 0 1px 4px rgba(31, 55, 72, 0.12)',
  shadowInsetTop: 'inset 0 1px 0 rgba(255, 255, 255, 0.74)',
  shadowInsetBottom: 'inset 0 -1px 0 rgba(31, 55, 72, 0.14)',
  blurGlass: '0px',
  blurRaised: '0px',
  noiseOpacity: '0',
  luminosityOpacity: '0',
});

export const highContrastTheme = stylex.createTheme(tokens, {
  colorCanvas: 'Canvas',
  colorCanvasElevated: 'Canvas',
  colorMaterialBackdrop: 'Canvas',
  colorMaterialTint: 'Canvas',
  colorMaterialRaised: 'Canvas',
  colorMaterialInset: 'Canvas',
  colorLuminosity: 'transparent',
  colorTextPrimary: 'CanvasText',
  colorTextSecondary: 'CanvasText',
  colorTextTertiary: 'CanvasText',
  colorTextDisabled: 'GrayText',
  colorTextInverse: 'HighlightText',
  colorBorderSubtle: 'CanvasText',
  colorBorderStrong: 'CanvasText',
  colorSpecularTop: 'CanvasText',
  colorInnerEdge: 'CanvasText',
  colorFocus: 'Highlight',
  colorFocusSoft: 'transparent',
  colorAccent: 'Highlight',
  colorAccentHover: 'Highlight',
  colorAccentPressed: 'Highlight',
  colorAccentMuted: 'Canvas',
  colorSelection: 'Highlight',
  colorSelectionStrong: 'Highlight',
  colorSuccess: 'CanvasText',
  colorSuccessMuted: 'Canvas',
  colorWarning: 'CanvasText',
  colorWarningMuted: 'Canvas',
  colorError: 'CanvasText',
  colorErrorMuted: 'Canvas',
  colorInfo: 'CanvasText',
  colorInfoMuted: 'Canvas',
  shadowAmbient: 'none',
  shadowFocused: 'none',
  shadowControl: 'none',
  shadowInsetTop: 'none',
  shadowInsetBottom: 'none',
  blurGlass: '0px',
  blurRaised: '0px',
  noiseOpacity: '0',
  luminosityOpacity: '0',
});

export const reducedEffectsTheme = stylex.createTheme(tokens, {
  blurGlass: '14px',
  blurRaised: '8px',
  noiseOpacity: '0',
  luminosityOpacity: '0.5',
  shadowAmbient: '0 18px 48px rgba(0, 0, 0, 0.34)',
  shadowFocused: '0 20px 54px rgba(0, 0, 0, 0.38)',
});

export const reducedMotionTheme = stylex.createTheme(tokens, {
  durationHover: '0ms',
  durationPress: '0ms',
  durationSelection: '80ms',
  durationOpen: '80ms',
  durationClose: '60ms',
  durationExpand: '80ms',
  durationPreview: '80ms',
  durationPage: '80ms',
});

export const themeContracts = {
  light: lightTheme,
  dark: darkTheme,
  opaque: opaqueTheme,
  highContrast: highContrastTheme,
  reducedEffects: reducedEffectsTheme,
  reducedMotion: reducedMotionTheme,
} as const;
