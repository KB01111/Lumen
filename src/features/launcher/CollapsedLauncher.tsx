import {memo, useCallback, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode, type RefObject} from 'react';

import {GlassCommandPalette} from '../../components/ui/GlassCommandPalette';
import {LumenAppMark} from '../../design-system/icons/LumenAppMark';
import {LumenUiIcon} from '../../design-system/icons/LumenUiIcon';
import {useLumenMotion} from '../../design-system/MotionProvider';
import {LumenButton} from '../../design-system/primitives/LumenButton';
import {LumenIconButton} from '../../design-system/primitives/LumenIconButton';
import {createWindowService} from '../../platform/window/tauri-window-service';
import type {WindowService} from '../../platform/window/window-service';
import {cn} from '../../lib/cn';
import {measureAfterPaint} from '../diagnostics/diagnostics.metrics';
import {LauncherStatus} from './LauncherStatus';
import {useLauncherStore} from './launcher.store';
import {useQueryStore} from './query.store';
import {ScopeRail} from './ScopeRail';
import {SearchInput} from './SearchInput';
import {requestWindowHide, useLauncherPresentation} from './useLauncherPresentation';


interface LauncherComposerProps {
  inputRef: RefObject<HTMLInputElement | null>;
  intentLocked: boolean;
  onComputerSubmit?: (task: string) => void;
  onEscapeEmpty(): void;
  onIntentChange(): void;
  onVoiceRequest?: () => void;
  voiceActive?: boolean;
}

const LauncherComposer = memo(function LauncherComposer({
  inputRef,
  intentLocked,
  onComputerSubmit,
  onEscapeEmpty,
  onIntentChange,
  onVoiceRequest,
  voiceActive = false,
}: LauncherComposerProps) {
  const intent = useLauncherStore((state) => state.intent);
  return (
    <div className="flex w-full min-w-0 items-center gap-[10px]" data-tauri-drag-region>
      <LumenAppMark />
      <LumenButton
        aria-label={intent === 'computer' ? 'Switch to file search' : 'Switch to Computer Use'}
        className={cn(
          'h-[30px] min-h-[30px] max-w-[148px] min-w-8 shrink-0 gap-[6px] rounded-pill px-[10px] font-medium',
          intent === 'computer'
            ? 'border-accent/30 bg-accent/12 text-accent data-[hovered]:bg-accent/18'
            : 'border-[color:var(--einui-command-divider)] bg-[var(--einui-command-row)] text-[color:var(--einui-command-muted-text)] data-[hovered]:border-[color:var(--einui-command-border)] data-[hovered]:bg-[var(--einui-command-row-hover)] data-[hovered]:text-[color:var(--einui-command-text)]',
        )}
        isDisabled={intentLocked}
        size="small"
        variant="subtle"
        onPress={onIntentChange}
      >
        <LumenUiIcon name={intent === 'computer' ? 'search' : 'computer'} size="small" />
        <span className="min-w-0 truncate">
          {intent === 'computer' ? 'File search' : 'Computer Use'}
        </span>
      </LumenButton>
      <span aria-hidden="true" className="h-[20px] w-px shrink-0 bg-[var(--einui-command-divider)]" />
      <SearchInput
        ref={inputRef}
        intent={intent}
        onEscapeEmpty={onEscapeEmpty}
        onSubmit={intentLocked ? undefined : onComputerSubmit}
      />
      {onVoiceRequest ? (
        <LumenIconButton
          aria-label={voiceActive ? 'Stop voice input' : 'Start voice input'}
          className={voiceActive ? 'rounded-pill bg-accent/15 text-accent' : 'rounded-pill'}
          size="small"
          variant="quiet"
          onPress={onVoiceRequest}
        >
          <LumenUiIcon name="voice" size="small" />
        </LumenIconButton>
      ) : null}
    </div>
  );
});

function LauncherFooter({
  inputRef,
  searching,
  statusLabel,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  searching: boolean;
  statusLabel?: string;
}) {
  const subscribe = useCallback((onChange: () => void) => {
    const input = inputRef.current;
    input?.addEventListener('input', onChange);
    const unsubscribe = useQueryStore.subscribe(onChange);
    return () => {
      input?.removeEventListener('input', onChange);
      unsubscribe();
    };
  }, [inputRef]);
  const getSnapshot = useCallback(
    () => (inputRef.current?.value ?? useQueryStore.getState().draft).length > 0,
    [inputRef],
  );
  const hasInput = useSyncExternalStore(subscribe, getSnapshot);
  return (
    <>
      <LauncherStatus label={statusLabel} searching={searching} />
      <span className="min-w-0 truncate">
        {hasInput ? 'Esc to clear' : 'Esc to close'}
      </span>
    </>
  );
}

export interface CollapsedLauncherProps {
  expandedContent?: ReactNode;
  inputRef?: RefObject<HTMLInputElement | null>;
  searching?: boolean;
  statusLabel?: string;
  windowService?: WindowService;
  onVoiceRequest?: () => void;
  voiceActive?: boolean;
  intentLocked?: boolean;
  focusOnMount?: boolean;
  onComputerSubmit?: (task: string) => void;
}

export function CollapsedLauncher({
  expandedContent,
  inputRef: providedInputRef,
  searching = false,
  statusLabel,
  windowService: providedWindowService,
  onVoiceRequest,
  voiceActive = false,
  intentLocked = false,
  focusOnMount = true,
  onComputerSubmit,
}: CollapsedLauncherProps) {
  const windowServiceRef = useRef<WindowService | null>(null);
  if (!windowServiceRef.current) {
    windowServiceRef.current = providedWindowService ?? createWindowService();
  }
  const windowService = providedWindowService ?? windowServiceRef.current;
  const hasCommittedQuery = useQueryStore((state) => state.committed.length > 0);
  const clearQuery = useQueryStore((state) => state.clear);
  const visible = useLauncherStore((state) => state.visible);
  const intent = useLauncherStore((state) => state.intent);
  const setIntent = useLauncherStore((state) => state.setIntent);
  const {reducedMotion} = useLumenMotion();
  const fallbackInputRef = useRef<HTMLInputElement>(null);
  const previousVisible = useRef(visible);
  const visibleRenderStartedAt = useRef<number | null>(visible ? performance.now() : null);
  if (visible) {
    if (!previousVisible.current) {
      visibleRenderStartedAt.current = performance.now();
    }
  } else {
    visibleRenderStartedAt.current = null;
  }
  previousVisible.current = visible;
  const inputRef = providedInputRef ?? fallbackInputRef;
  const retainedWorkspace = useRef(expandedContent);
  if (hasCommittedQuery) retainedWorkspace.current = expandedContent;
  const {expanded, presentationError, onWorkspaceExitComplete} = useLauncherPresentation({
    hasContent: hasCommittedQuery,
    windowService,
  });

  useLayoutEffect(() => {
    if (!visible || !focusOnMount) {
      return;
    }
    inputRef.current?.focus();
    void windowService.focusInput();
    return measureAfterPaint(
      'launcher-visible',
      visibleRenderStartedAt.current ?? performance.now(),
    );
  }, [focusOnMount, inputRef, visible, windowService]);

  const handleEscapeEmpty = useCallback(() => {
    void requestWindowHide(windowService);
  }, [windowService]);

  const handleIntentChange = useCallback(() => {
    clearQuery();
    setIntent(intent === 'computer' ? 'search' : 'computer');
  }, [clearQuery, intent, setIntent]);

  return (
    <GlassCommandPalette
      aria-label="Lumen launcher"
      composer={(
        <LauncherComposer
          inputRef={inputRef}
          intentLocked={intentLocked}
          onComputerSubmit={intent === 'computer' ? onComputerSubmit : undefined}
          onEscapeEmpty={handleEscapeEmpty}
          onIntentChange={handleIntentChange}
          onVoiceRequest={onVoiceRequest}
          voiceActive={voiceActive}
        />
      )}
      expanded={expanded}
      onWorkspaceExitComplete={onWorkspaceExitComplete}
      scopes={intent === 'search' ? <ScopeRail /> : null}
      body={hasCommittedQuery ? expandedContent : retainedWorkspace.current}
      footer={(
        <LauncherFooter
          inputRef={inputRef}
          searching={searching}
          statusLabel={presentationError ?? statusLabel}
        />
      )}
      reducedMotion={reducedMotion}
    />
  );
}
