import {useEffect, useRef, useState, type KeyboardEvent} from 'react';

import {AnimatePresence, motion} from 'motion/react';

import {useLumenMotion} from '../../design-system/MotionProvider';
import {LumenUiIcon} from '../../design-system/icons/LumenUiIcon';
import {LumenButton} from '../../design-system/primitives/LumenButton';
import {LumenSurface} from '../../design-system/primitives/LumenSurface';
import {LumenText} from '../../design-system/primitives/LumenText';
import {createWindowService} from '../../platform/window/tauri-window-service';
import type {WindowService} from '../../platform/window/window-service';
import {useLauncherStore} from '../launcher/launcher.store';
import {requestWindowShow} from '../launcher/useLauncherPresentation';
import {LumenSelect, LumenSwitch} from '../settings/components/SettingsControls';
import {useSettingsStore} from '../settings/settings.store';
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
  if (step === 'welcome') {
    return (
      <OnboardingScene
        description="Find the file you mean before the thought is gone."
        icon={<LumenUiIcon className="size-12" name="search" />}
        support="Fast local search comes first. AI and cloud providers remain optional."
        title="Everything, within reach"
      />
    );
  }
  return <ChoicesScene />;
}

function ChoicesScene() {
  const ai = useSettingsStore((state) => state.ai);
  const updateAi = useSettingsStore((state) => state.updateAi);
  const setCloudAnswerConsent = useSettingsStore((state) => state.setCloudAnswerConsent);
  return (
    <OnboardingScene
      description="Exact local search is always available. AI answers are optional."
      icon={<LumenUiIcon className="size-12" name="hardware" />}
      support="Cloud answers can send the query and relevant local excerpts to your configured provider. Leave this off to keep answers local."
      title="Choose how answers run"
    >
      <div className="grid min-w-[360px] gap-4 rounded-surface border border-border-subtle bg-surface-inset p-5 text-left">
        <div className="flex items-center justify-between gap-6">
          <LumenText>Answer mode</LumenText>
          <LumenSelect
            aria-label="Answer mode"
            options={[{id: 'auto', label: 'Automatic'}, {id: 'local', label: 'Local only'}]}
            value={ai.runtimeMode === 'cloud' ? 'auto' : ai.runtimeMode}
            onChange={(runtimeMode) => void updateAi({runtimeMode})}
          />
        </div>
        <div className="flex items-center justify-between gap-6">
          <LumenText>Allow cloud answers</LumenText>
          <LumenSwitch aria-label="Allow cloud answers" isSelected={ai.cloudAnswerConsent} onChange={(granted) => void setCloudAnswerConsent(granted)} />
        </div>
      </div>
    </OnboardingScene>
  );
}

export interface OnboardingFlowProps {
  rootService?: RootSelectionService;
  windowService?: WindowService;
  onComplete?: () => boolean | void | Promise<boolean | void>;
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
  const [completionError, setCompletionError] = useState('');
  const [completing, setCompleting] = useState(false);
  const step = onboardingSteps[currentIndex] ?? 'welcome';

  useEffect(() => {
    useLauncherStore.getState().show('onboarding');
    void windowService.show('onboarding').catch(() => undefined);
  }, [windowService]);

  useEffect(() => {
    shellRef.current
      ?.querySelector<HTMLElement>('[data-onboarding-primary="true"]')
      ?.focus();
  }, [currentIndex]);

  const finish = async () => {
    setCompleting(true);
    setCompletionError('');
    try {
      await windowService.setShortcut(shortcut);
      if (await onComplete?.() === false) {
        throw new Error('Lumen could not start the initial index. Check the selected folder and try again.');
      }
      if (complete()) {
        void requestWindowShow(windowService, 'collapsed');
      }
    } catch (error) {
      setCompletionError(error instanceof Error ? error.message : 'Lumen could not finish setup.');
    } finally {
      setCompleting(false);
    }
  };

  const advance = () => {
    directionRef.current = 'forward';
    if (currentIndex === 0) {
      begin();
      return;
    }
    if (currentIndex === onboardingSteps.length - 1) {
      void finish();
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
        {completionError ? <span className="text-xs text-danger" role="alert">{completionError}</span> : null}
        {currentIndex > 0 && !completionError ? (
          <LumenButton data-testid="onboarding-back-action" size="medium" variant="quiet" onPress={goBack}>Back</LumenButton>
        ) : <span aria-hidden="true" className="w-9" />}
        <LumenButton
          data-onboarding-primary="true"
          data-testid="onboarding-primary-action"
          isDisabled={completing || (step === 'root' && !isValidRoot(root))}
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
