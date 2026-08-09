import {useEffect, useRef, type KeyboardEvent} from 'react';

import {AnimatePresence, motion} from 'motion/react';

import {useLumenMotion} from '../../design-system/MotionProvider';
import {LumenUiIcon} from '../../design-system/icons/LumenUiIcon';
import {LumenButton} from '../../design-system/primitives/LumenButton';
import {LumenSurface} from '../../design-system/primitives/LumenSurface';
import {LumenText} from '../../design-system/primitives/LumenText';
import {createWindowService} from '../../platform/window/tauri-window-service';
import type {WindowService} from '../../platform/window/window-service';
import {requestWindowShow} from '../launcher/useLauncherPresentation';
import {OnboardingScene} from './OnboardingScene';
import {
  isValidRoot,
  onboardingSteps,
  useOnboardingStore,
  type OnboardingStep,
} from './onboarding.store';
import {RootSelectionScene} from './RootSelectionScene';
import {
  createRootSelectionService,
  type RootSelectionService,
} from './root-selection-service';
import {ShortcutScene} from './ShortcutScene';

const defaultRootService = createRootSelectionService();

function StandardScene({step}: {step: Exclude<OnboardingStep, 'root' | 'shortcut'>}) {
  switch (step) {
    case 'welcome':
      return (
        <OnboardingScene
          description="Find the file you mean before the thought is gone."
          icon={<LumenUiIcon className="size-12" name="search" />}
          support="Lumen is a keyboard-first search instrument built for Windows 11."
          title="Everything, within reach"
        />
      );
    case 'privacy':
      return (
        <OnboardingScene
          description="Your filenames, previews, and search history stay on this PC."
          icon={<LumenUiIcon className="size-12" name="privacy" />}
          support="Cloud providers are optional, explicit, and off until you choose otherwise."
          title="Local by design"
        />
      );
    case 'indexing':
      return (
        <OnboardingScene
          description="This phase uses simple local filename search while the production index is still to come."
          icon={<LumenUiIcon className="size-12" name="storage" />}
          support="Future indexing will run quietly and expose clear progress and pause states."
          title="A calm background index"
        />
      );
    case 'local-ai':
      return (
        <OnboardingScene
          description="Local AI providers will later add meaning without sending private files away."
          icon={<LumenUiIcon className="size-12" name="hardware" />}
          support="NPU, GPU, CPU, and fallback status will always be visible—not implied."
          title="Intelligence stays optional"
        />
      );
    case 'exact-search':
      return (
        <OnboardingScene
          description="Exact filename and folder search remains available without any model."
          icon={<LumenUiIcon className="size-12" name="bolt" />}
          support="Semantic search and reranking enhance the result set; they never gate it."
          title="Fast even without AI"
        />
      );
    case 'activity':
      return (
        <OnboardingScene
          description="Lumen can pause heavy work for games, fullscreen apps, video, and battery life."
          icon={<LumenUiIcon className="size-12" name="tools" />}
          support="Search stays available while background activity adapts to the moment."
          title="Quiet when focus matters"
        />
      );
  }
}

export interface OnboardingFlowProps {
  rootService?: RootSelectionService;
  windowService?: WindowService;
  onComplete?: () => void;
}

export function OnboardingFlow({
  rootService = defaultRootService,
  windowService: providedWindowService,
  onComplete,
}: OnboardingFlowProps) {
  const windowServiceRef = useRef<WindowService | null>(null);
  if (!windowServiceRef.current) {
    windowServiceRef.current = providedWindowService ?? createWindowService();
  }
  const windowService = providedWindowService ?? windowServiceRef.current;
  const {pageDuration, reducedMotion} = useLumenMotion();
  const currentIndex = useOnboardingStore((state) => state.currentIndex);
  const root = useOnboardingStore((state) => state.root);
  const shortcut = useOnboardingStore((state) => state.shortcut);
  const back = useOnboardingStore((state) => state.back);
  const begin = useOnboardingStore((state) => state.begin);
  const complete = useOnboardingStore((state) => state.complete);
  const next = useOnboardingStore((state) => state.next);
  const setRoot = useOnboardingStore((state) => state.setRoot);
  const shellRef = useRef<HTMLDivElement>(null);
  const directionRef = useRef<'forward' | 'backward'>('forward');
  const step = onboardingSteps[currentIndex] ?? 'welcome';

  useEffect(() => {
    void requestWindowShow(windowService, 'onboarding');
  }, [windowService]);

  useEffect(() => {
    shellRef.current
      ?.querySelector<HTMLElement>('[data-onboarding-primary="true"]')
      ?.focus();
  }, [currentIndex]);

  const advance = () => {
    directionRef.current = 'forward';
    if (currentIndex === 0) {
      begin();
      return;
    }
    if (currentIndex === onboardingSteps.length - 1) {
      if (complete()) {
        onComplete?.();
        void requestWindowShow(windowService, 'collapsed');
      }
      return;
    }
    next();
  };

  const goBack = () => {
    directionRef.current = 'backward';
    back();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && currentIndex > 0) {
      event.preventDefault();
      goBack();
    }
  };

  const primaryLabel = currentIndex === 0
    ? 'Begin'
    : currentIndex === onboardingSteps.length - 1
      ? 'Start using Lumen'
      : 'Continue';

  return (
    <LumenSurface
      ref={shellRef}
      aria-label="Welcome to Lumen"
      className="grid h-full w-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-surface"
      material="mica"
      onKeyDown={handleKeyDown}
    >
      <header data-tauri-drag-region className="flex min-h-[54px] items-center justify-between gap-6 border-b border-border-subtle px-8">
        <LumenText weight="semibold">Lumen</LumenText>
        <div aria-label={`Step ${currentIndex + 1} of ${onboardingSteps.length}`} className="flex items-center gap-2">
          {onboardingSteps.map((item, index) => (
            <span
              key={item}
              aria-hidden="true"
              className={index <= currentIndex ? 'h-[3px] w-[18px] rounded-pill bg-accent' : 'h-[3px] w-[18px] rounded-pill bg-border-strong'}
            />
          ))}
        </div>
      </header>
      <div className="grid min-h-0 min-w-0 place-items-center overflow-hidden py-12">
        <AnimatePresence custom={directionRef.current} initial={false} mode="wait">
          <motion.div
            key={step}
            data-motion-direction={reducedMotion ? 'fade' : 'spatial'}
            data-testid="onboarding-scene"
            className="w-full"
            animate="center"
            custom={directionRef.current}
            exit="exit"
            initial="enter"
            transition={{duration: pageDuration}}
            variants={{
              enter: (direction: 'forward' | 'backward') => (
                reducedMotion
                  ? {opacity: 0}
                  : {opacity: 0, x: direction === 'forward' ? 18 : -18}
              ),
              center: {opacity: 1, x: 0},
              exit: (direction: 'forward' | 'backward') => (
                reducedMotion
                  ? {opacity: 0}
                  : {opacity: 0, x: direction === 'forward' ? -14 : 14}
              ),
            }}
          >
            {step === 'root' ? (
              <RootSelectionScene root={root} service={rootService} onRoot={setRoot} />
            ) : step === 'shortcut' ? (
              <ShortcutScene shortcut={shortcut} />
            ) : (
              <StandardScene step={step} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <footer className="flex min-h-16 items-center justify-between gap-6 border-t border-border-subtle px-8">
        {currentIndex > 0 ? (
          <LumenButton data-testid="onboarding-back-action" size="medium" variant="quiet" onPress={goBack}>Back</LumenButton>
        ) : <span aria-hidden="true" className="w-9" />}
        <LumenButton
          data-onboarding-primary="true"
          data-testid="onboarding-primary-action"
          isDisabled={step === 'root' && !isValidRoot(root)}
          size="medium"
          variant="primary"
          onPress={advance}
        >
          {primaryLabel}
        </LumenButton>
      </footer>
    </LumenSurface>
  );
}
