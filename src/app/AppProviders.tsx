import * as stylex from '@stylexjs/stylex';
import type {PropsWithChildren, ProfilerOnRenderCallback} from 'react';
import {Profiler, useEffect, useMemo, useSyncExternalStore} from 'react';
import {LumenMotionProvider} from '../design-system/MotionProvider';
import {
  darkTheme,
  highContrastTheme,
  lightTheme,
  opaqueTheme,
  reducedEffectsTheme,
  reducedMotionTheme,
  type AppearancePreferences,
} from '../design-system/themes.stylex';
import {tokens} from '../design-system/tokens.stylex';
import {captureReactCommit, startDiagnosticsObserver} from '../features/diagnostics/diagnostics.metrics';
import {useAppearanceStore} from '../state/appearance.store';

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

const recordCommit: ProfilerOnRenderCallback = (_id, _phase, actualDuration) => {
  captureReactCommit(actualDuration);
};

export function AppProviders({
  children,
  appearance,
}: AppProvidersProps) {
  const storedMode = useAppearanceStore((state) => state.mode);
  const storedTransparency = useAppearanceStore((state) => state.transparency);
  const storedEffects = useAppearanceStore((state) => state.effects);
  const storedMotion = useAppearanceStore((state) => state.motion);
  const hydrateAppearance = useAppearanceStore((state) => state.hydrate);
  const storedAppearance = useMemo<AppearancePreferences>(
    () => ({
      mode: storedMode,
      transparency: storedTransparency,
      effects: storedEffects,
      motion: storedMotion,
    }),
    [storedEffects, storedMode, storedMotion, storedTransparency],
  );
  const resolvedAppearance = appearance ?? storedAppearance;
  const systemDark = useMediaPreference('(prefers-color-scheme: dark)');
  const systemReducedMotion = useMediaPreference('(prefers-reduced-motion: reduce)');
  const forcedColors = useMediaPreference('(forced-colors: active)');
  const prefersMoreContrast = useMediaPreference('(prefers-contrast: more)');
  const highContrast = forcedColors || prefersMoreContrast;
  const resolvedMode = resolvedAppearance.mode === 'system'
    ? systemDark
      ? 'dark'
      : 'light'
    : resolvedAppearance.mode;
  const reducedMotion = resolvedAppearance.motion === 'reduced' ||
    (resolvedAppearance.motion === 'system' && systemReducedMotion);
  const reducedEffects = resolvedAppearance.effects === 'reduced';
  const opaque = resolvedAppearance.transparency === 'disabled';

  useEffect(() => {
    if (appearance === undefined) {
      void hydrateAppearance();
    }
  }, [appearance, hydrateAppearance]);

  useEffect(() => startDiagnosticsObserver(), []);

  return (
    <LumenMotionProvider reducedMotion={reducedMotion}>
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
        data-theme={resolvedAppearance.mode}
        data-resolved-theme={resolvedMode}
        data-transparency={resolvedAppearance.transparency}
        data-contrast={highContrast ? 'high' : 'standard'}
        data-effects={resolvedAppearance.effects}
        data-motion={resolvedAppearance.motion}
        data-reduced-motion={reducedMotion}
      >
        <Profiler id="Lumen" onRender={recordCommit}>{children}</Profiler>
      </div>
    </LumenMotionProvider>
  );
}
