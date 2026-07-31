import * as stylex from '@stylexjs/stylex';
import {MotionConfig} from 'motion/react';
import type {PropsWithChildren} from 'react';
import {useSyncExternalStore} from 'react';
import {
  darkTheme,
  defaultAppearance,
  highContrastTheme,
  lightTheme,
  opaqueTheme,
  reducedEffectsTheme,
  reducedMotionTheme,
  type AppearancePreferences,
} from '../design-system/themes.stylex';
import {tokens} from '../design-system/tokens.stylex';

const styles = stylex.create({
  root: {
    width: '100%',
    height: '100%',
    color: tokens.colorTextPrimary,
    fontFamily: tokens.fontFamilyText,
    backgroundColor: 'transparent',
  },
});

function subscribeToMedia(query: string, onChange: () => void) {
  if (typeof window.matchMedia !== 'function') {
    return () => undefined;
  }

  const media = window.matchMedia(query);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function readMedia(query: string) {
  return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

function useMediaPreference(query: string) {
  return useSyncExternalStore(
    (onChange) => subscribeToMedia(query, onChange),
    () => readMedia(query),
    () => false,
  );
}

interface AppProvidersProps extends PropsWithChildren {
  appearance?: AppearancePreferences;
}

export function AppProviders({
  children,
  appearance = defaultAppearance,
}: AppProvidersProps) {
  const systemDark = useMediaPreference('(prefers-color-scheme: dark)');
  const systemReducedMotion = useMediaPreference('(prefers-reduced-motion: reduce)');
  const forcedColors = useMediaPreference('(forced-colors: active)');
  const prefersMoreContrast = useMediaPreference('(prefers-contrast: more)');
  const highContrast = forcedColors || prefersMoreContrast;
  const resolvedMode = appearance.mode === 'system'
    ? systemDark
      ? 'dark'
      : 'light'
    : appearance.mode;
  const reducedMotion = appearance.motion === 'reduced' ||
    (appearance.motion === 'system' && systemReducedMotion);
  const reducedEffects = appearance.effects === 'reduced';
  const opaque = appearance.transparency === 'disabled';

  return (
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'never'}>
      <div
        {...stylex.props(
          styles.root,
          resolvedMode === 'dark' ? darkTheme : lightTheme,
          opaque && opaqueTheme,
          highContrast && highContrastTheme,
          reducedEffects && reducedEffectsTheme,
          reducedMotion && reducedMotionTheme,
        )}
        role="application"
        aria-label="Lumen"
        data-theme={appearance.mode}
        data-resolved-theme={resolvedMode}
        data-transparency={appearance.transparency}
        data-contrast={highContrast ? 'high' : 'standard'}
        data-effects={appearance.effects}
        data-motion={appearance.motion}
      >
        {children}
      </div>
    </MotionConfig>
  );
}
