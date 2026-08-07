import {lazy, Suspense, useCallback, useEffect, useState} from 'react';

import * as stylex from '@stylexjs/stylex';

import {LumenMark} from '../design-system/icons/LumenMark';
import {LumenSurface} from '../design-system/primitives/LumenSurface';
import {LumenText} from '../design-system/primitives/LumenText';
import type {AppearancePreferences} from '../design-system/theme';
import {tokens} from '../design-system/tokens.stylex';
import {SearchExperience} from '../features/launcher/SearchExperience';
import {useLauncherStore} from '../features/launcher/launcher.store';
import {useQueryStore} from '../features/launcher/query.store';
import {useOnboardingStore} from '../features/onboarding/onboarding.store';
import {createIndexedRoot} from '../features/settings/indexed-root';
import {useSettingsStore} from '../features/settings/settings.store';
import {createWindowService} from '../platform/window/tauri-window-service';
import {TauriAnswerService} from '../services/answer/tauri-answer-service';
import {TauriComputerUseService} from '../services/computer-use/tauri-computer-use-service';
import {UnavailableComputerUseService} from '../services/computer-use/unavailable-computer-use-service';
import {isNativeRuntime, nativeAiService} from '../services/ai/native-ai-service';
import {DevelopmentFileSearchService} from '../services/search/development-file-search-service';
import {DevelopmentSearchService} from '../services/search/development-search-service';
import {AppProviders} from './AppProviders';

const styles = stylex.create({
  stage: {
    width: '100%',
    height: '100%',
    display: 'grid',
    alignItems: 'stretch',
    padding: tokens.space3,
    backgroundColor: 'transparent',
  },
  shell: {
    width: '100%',
    height: '100%',
    borderRadius: tokens.radiusLauncher,
  },
  launcher: {
    minWidth: 0,
    minHeight: '52px',
    display: 'flex',
    alignItems: 'center',
    gap: tokens.space6,
    paddingInline: tokens.space6,
  },
  markWell: {
    width: '38px',
    height: '38px',
    display: 'grid',
    flexShrink: 0,
    placeItems: 'center',
    color: tokens.colorAccent,
    backgroundColor: tokens.colorAccentMuted,
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusMedium,
    boxShadow: tokens.shadowInsetTop,
  },
  mark: {
    filter: 'drop-shadow(0 0 10px currentColor)',
  },
  divider: {
    width: '1px',
    height: '26px',
    flexShrink: 0,
    backgroundColor: tokens.colorBorderSubtle,
  },
  prompt: {
    minWidth: 0,
    display: 'flex',
    flex: 1,
    alignItems: 'baseline',
    gap: tokens.space4,
    overflow: 'hidden',
  },
  promptText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  status: {
    display: 'inline-flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: tokens.space3,
    color: tokens.colorTextTertiary,
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: tokens.radiusRound,
    backgroundColor: tokens.colorSuccess,
    boxShadow: `0 0 9px ${tokens.colorSuccess}`,
  },
  shortcut: {
    display: 'inline-flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: tokens.space2,
    paddingBlock: tokens.space2,
    paddingInline: tokens.space5,
    color: tokens.colorTextSecondary,
    backgroundColor: tokens.colorMaterialInset,
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusSmall,
    boxShadow: tokens.shadowInsetBottom,
    fontFamily: tokens.fontFamilyText,
    fontSize: tokens.fontSizeCaption,
    lineHeight: tokens.lineHeightTight,
  },
});

const foundationAppearances: AppearancePreferences[] = [
  {mode: 'dark', transparency: 'native', effects: 'full', motion: 'full'},
  {mode: 'light', transparency: 'native', effects: 'full', motion: 'full'},
  {mode: 'dark', transparency: 'disabled', effects: 'reduced', motion: 'reduced'},
];

function createDefaultSearchService() {
  const useDevelopmentService = import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get('service') === 'memory';
  if (useDevelopmentService) {
    return new DevelopmentSearchService();
  }
  return new DevelopmentFileSearchService({
    getRoots: () => {
      const settingsRoots = useSettingsStore
        .getState()
        .roots
        .filter((root) => !root.paused)
        .map((root) => root.path);
      if (settingsRoots.length > 0) {
        return settingsRoots;
      }
      const onboardingRoot = useOnboardingStore.getState().root;
      return onboardingRoot ? [onboardingRoot] : [];
    },
    getRootConfigurations: () => {
      const settings = useSettingsStore.getState();
      const configuredRoots = settings.roots
        .filter((root) => !root.paused)
        .map((root) => ({
          id: root.id,
          path: root.path,
          cloudEnrichment: settings.ai.cloudEnrichedRootIds.includes(root.id),
        }));
      if (configuredRoots.length > 0) {
        return configuredRoots;
      }
      const onboardingRoot = useOnboardingStore.getState().root;
      return onboardingRoot ? [{
        id: `onboarding:${onboardingRoot}`,
        path: onboardingRoot,
        cloudEnrichment: false,
      }] : [];
    },
  });
}

const defaultSearchService = createDefaultSearchService();
const defaultAnswerService = new TauriAnswerService();
const defaultComputerUseService = isNativeRuntime()
  ? new TauriComputerUseService()
  : new UnavailableComputerUseService();
const appWindowService = createWindowService();
const OnboardingFlow = lazy(async () => {
  const module = await import('../features/onboarding/OnboardingFlow');
  return {default: module.OnboardingFlow};
});
const SettingsShell = lazy(async () => {
  const module = await import('../features/settings/SettingsShell');
  return {default: module.SettingsShell};
});
const DiagnosticsOverlay = lazy(async () => {
  const module = await import('../features/diagnostics/DiagnosticsOverlay');
  return {default: module.DiagnosticsOverlay};
});
const VisualStateGallery = import.meta.env.DEV ? lazy(async () => {
  const module = await import('../features/gallery/VisualStateGallery');
  return {default: module.VisualStateGallery};
}) : null;

function isFoundationPreview() {
  return import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get('mode') === 'foundation';
}

function isGalleryPreview() {
  return import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get('gallery') === '1';
}

function galleryAppearance() {
  const parameters = new URLSearchParams(window.location.search);
  const scenario = parameters.get('scenario');
  const theme = parameters.get('theme') ?? (
    scenario === 'theme-light' ? 'light'
      : scenario === 'theme-opaque' ? 'opaque'
        : scenario === 'theme-high-contrast' ? 'high-contrast'
          : scenario === 'theme-reduced-motion' ? 'reduced-motion'
            : 'dark'
  );
  const appearance: AppearancePreferences = {
    mode: theme === 'light' ? 'light' : 'dark',
    transparency: theme === 'opaque' ? 'disabled' : 'native',
    effects: theme === 'opaque' ? 'reduced' : 'full',
    motion: theme === 'reduced-motion' ? 'reduced' : 'full',
  };
  return {appearance, forceHighContrast: theme === 'high-contrast'};
}

function getOnboardingMode() {
  if (!import.meta.env.DEV) {
    return 'persisted' as const;
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get('onboarding') === '1') {
    return 'forced' as const;
  }
  if (params.get('onboarded') === '1' || params.get('service') === 'memory') {
    return 'bypassed' as const;
  }
  return 'persisted' as const;
}

export function App() {
  const foundationPreview = isFoundationPreview();
  const galleryPreview = isGalleryPreview();
  const galleryPresentation = galleryPreview ? galleryAppearance() : null;
  const onboardingMode = getOnboardingMode();
  const onboardingCompleted = useOnboardingStore((state) => state.completed);
  const onboardingHydrated = useOnboardingStore((state) => state.hydrated);
  const hydrateOnboarding = useOnboardingStore((state) => state.hydrate);
  const hydrateSettings = useSettingsStore((state) => state.hydrate);
  const runtimeMode = useSettingsStore((state) => state.ai.runtimeMode);
  const keepLocalWarm = useSettingsStore((state) => state.ai.keepLocalWarm);
  const [foundationAppearance, setFoundationAppearance] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!foundationPreview) {
      return;
    }

    const cycleFoundationAppearance = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        setFoundationAppearance((current) =>
          (current + 1) % foundationAppearances.length,
        );
      }
    };

    window.addEventListener('keydown', cycleFoundationAppearance);
    return () => window.removeEventListener('keydown', cycleFoundationAppearance);
  }, [foundationPreview]);

  useEffect(() => {
    if (!foundationPreview && !galleryPreview && onboardingMode === 'persisted') {
      void hydrateOnboarding();
    }
  }, [foundationPreview, galleryPreview, hydrateOnboarding, onboardingMode]);

  useEffect(() => {
    if (!foundationPreview && !galleryPreview) {
      void hydrateSettings();
    }
  }, [foundationPreview, galleryPreview, hydrateSettings]);

  useEffect(() => {
    if (isNativeRuntime()) {
      void nativeAiService.setLocalRuntimeMode(runtimeMode, keepLocalWarm);
    }
  }, [keepLocalWarm, runtimeMode]);

  const completeOnboarding = useCallback(() => {
    const root = useOnboardingStore.getState().root;
    if (!root) {
      return;
    }
    const settings = useSettingsStore.getState();
    if (!settings.roots.some((item) => item.path.toLocaleLowerCase() === root.toLocaleLowerCase())) {
      void settings.setRoots([...settings.roots, createIndexedRoot(root)]);
    }
  }, []);

  const showOnboarding = !foundationPreview && !galleryPreview && (
    (onboardingMode === 'forced' && !onboardingCompleted) ||
    (onboardingMode === 'persisted' && onboardingHydrated && !onboardingCompleted)
  );
  const onboardingPending = !foundationPreview && !galleryPreview &&
    onboardingMode === 'persisted' &&
    !onboardingHydrated;

  const closeSettings = useCallback(() => {
    const targetMode = useQueryStore.getState().committed ? 'expanded' : 'collapsed';
    useLauncherStore.getState().show(targetMode);
    setSettingsOpen(false);
    void appWindowService.show(targetMode);
  }, []);

  return (
    <AppProviders
      appearance={galleryPresentation?.appearance ?? (
        foundationPreview ? foundationAppearances[foundationAppearance] : undefined
      )}
      forceHighContrast={galleryPresentation?.forceHighContrast}
    >
      <main {...stylex.props(styles.stage)}>
        {galleryPreview && VisualStateGallery ? (
          <Suspense fallback={null}><VisualStateGallery /></Suspense>
        ) : foundationPreview ? (
          <LumenSurface
            aria-label="Lumen launcher"
            className={stylex.props(styles.shell).className}
            material="mica"
          >
            <div data-tauri-drag-region {...stylex.props(styles.launcher)}>
              <span aria-hidden="true" {...stylex.props(styles.markWell)}>
                <LumenMark
                  className={stylex.props(styles.mark).className}
                  size="large"
                />
              </span>
              <span aria-hidden="true" {...stylex.props(styles.divider)} />
              <div {...stylex.props(styles.prompt)}>
                <LumenText
                  className={stylex.props(styles.promptText).className}
                  tone="secondary"
                  variant="bodyLarge"
                >
                  Search apps, files, and settings
                </LumenText>
                <LumenText tone="tertiary" variant="caption">
                  Local
                </LumenText>
              </div>
              <span aria-label="Local search ready" {...stylex.props(styles.status)}>
                <span aria-hidden="true" {...stylex.props(styles.statusDot)} />
                <LumenText tone="tertiary" variant="caption">
                  Ready
                </LumenText>
              </span>
              <kbd aria-label="Alt plus Space" {...stylex.props(styles.shortcut)}>
                Alt&nbsp;&nbsp;Space
              </kbd>
            </div>
          </LumenSurface>
        ) : showOnboarding ? (
          <Suspense fallback={null}>
            <OnboardingFlow onComplete={completeOnboarding} />
          </Suspense>
        ) : settingsOpen ? (
          <Suspense fallback={null}>
            <SettingsShell onClose={closeSettings} />
          </Suspense>
        ) : onboardingPending ? null : (
          <SearchExperience
            answerService={defaultAnswerService}
            computerUseService={defaultComputerUseService}
            service={defaultSearchService}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}
      </main>
      {import.meta.env.DEV ? (
        <Suspense fallback={null}><DiagnosticsOverlay /></Suspense>
      ) : null}
    </AppProviders>
  );
}
