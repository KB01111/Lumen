import {memo, useCallback, useLayoutEffect, useRef, type ReactNode, type RefObject} from 'react';

import {GlassCommandPalette} from '../../components/ui/GlassCommandPalette';
import {LumenUiIcon} from '../../design-system/icons/LumenUiIcon';
import {useLumenMotion} from '../../design-system/MotionProvider';
import {Button} from '@fluentui/react-components';
import {createWindowService} from '../../platform/window/tauri-window-service';
import type {WindowService} from '../../platform/window/window-service';
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
    <div className="flex w-full min-w-0 items-center gap-3" data-tauri-drag-region>
      <SearchInput
        ref={inputRef}
        intent={intent}
        onEscapeEmpty={onEscapeEmpty}
        onSubmit={intentLocked ? undefined : onComputerSubmit}
      />
      <Button data-launcher-control
        aria-label={intent === 'computer' ? 'Switch to file search' : 'Switch to Computer Use'}
        data-launcher-intent-switch
        className="max-w-[140px] min-w-8 shrink-0 gap-1.5 px-2"
        disabled={intentLocked}
        size="small"
        appearance="subtle"
        onClick={onIntentChange}
      >
        <LumenUiIcon name={intent === 'computer' ? 'search' : 'computer'} size="small" />
        <span className="min-w-0 truncate">
          {intent === 'computer' ? 'File search' : 'Computer Use'}
        </span>
      </Button>
      {onVoiceRequest ? (
        <Button data-launcher-control
          aria-label={voiceActive ? 'Stop voice input' : 'Start voice input'}
          className="shrink-0"
          size="small"
          appearance="subtle"
          onClick={onVoiceRequest}
        >
          <LumenUiIcon name="voice" size="small" />
        </Button>
      ) : null}
    </div>
  );
});

function LauncherFooter({
  actions,
  searching,
  statusLabel,
}: {
  actions?: ReactNode;
  searching: boolean;
  statusLabel?: string;
}) {
  return (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <LauncherStatus label={statusLabel} searching={searching} />
        <kbd className="hidden shrink-0 font-sans text-[0.6875rem] @min-[40rem]/footer:inline" aria-label="Alt plus Space">
          Alt + Space
        </kbd>
      </div>
      {actions}
    </>
  );
}

export interface CollapsedLauncherProps {
  expandedContent?: ReactNode;
  footerActions?: ReactNode;
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
  footerActions,
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
          actions={footerActions}
          searching={searching}
          statusLabel={presentationError ?? statusLabel}
        />
      )}
      reducedMotion={reducedMotion}
    />
  );
}
