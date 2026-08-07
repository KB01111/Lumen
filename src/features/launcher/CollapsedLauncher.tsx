import {useEffect, useRef, type ReactNode, type RefObject} from 'react';

import {GlassCommandPalette} from '../../components/ui/GlassCommandPalette';
import {LumenMark} from '../../design-system/icons/LumenMark';
import {LumenUiIcon} from '../../design-system/icons/LumenUiIcon';
import {useLumenMotion} from '../../design-system/MotionProvider';
import {LumenButton} from '../../design-system/primitives/LumenButton';
import {createWindowService} from '../../platform/window/tauri-window-service';
import type {WindowService} from '../../platform/window/window-service';
import {cn} from '../../lib/cn';
import {measureAfterPaint} from '../diagnostics/diagnostics.metrics';
import {LauncherStatus} from './LauncherStatus';
import {useLauncherStore} from './launcher.store';
import {useQueryStore} from './query.store';
import {ScopeRail} from './ScopeRail';
import {SearchInput} from './SearchInput';
import {useLauncherPresentation} from './useLauncherPresentation';

const defaultWindowService = createWindowService();

interface LauncherComposerProps {
  inputRef: RefObject<HTMLInputElement | null>;
  intentLocked: boolean;
  onComputerSubmit?: (task: string) => void;
  onEscapeEmpty(): void;
  onIntentChange(): void;
  onVoiceRequest?: () => void;
}

function LauncherComposer({
  inputRef,
  intentLocked,
  onComputerSubmit,
  onEscapeEmpty,
  onIntentChange,
  onVoiceRequest,
}: LauncherComposerProps) {
  const intent = useLauncherStore((state) => state.intent);
  return (
    <div className="flex min-w-0 items-center gap-3" data-tauri-drag-region>
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-[var(--lumen-radius-control)] border border-[color:var(--einui-command-divider)] bg-[var(--einui-command-row)] text-accent shadow-[var(--lumen-shadow-control)]"
      >
        <LumenMark className="drop-shadow-[0_0_10px_currentColor]" size="large" />
      </span>
      <LumenButton
        aria-label={intent === 'computer' ? 'Switch to file search' : 'Switch to Computer Use'}
        className="shrink-0"
        isDisabled={intentLocked}
        size="small"
        variant="quiet"
        onPress={onIntentChange}
      >
        <LumenUiIcon name={intent === 'computer' ? 'search' : 'computer'} size="small" />
        {intent === 'computer' ? 'File search' : 'Computer Use'}
      </LumenButton>
      <SearchInput
        ref={inputRef}
        intent={intent}
        onEscapeEmpty={onEscapeEmpty}
        onSubmit={intentLocked ? undefined : onComputerSubmit}
      />
      {onVoiceRequest ? (
        <LumenButton
          aria-label="Start voice input"
          className="shrink-0"
          size="small"
          variant="quiet"
          onPress={onVoiceRequest}
        >
          <LumenUiIcon name="voice" size="small" />
        </LumenButton>
      ) : null}
      <kbd className="einui-command-shortcut hidden shrink-0 sm:inline-flex" aria-label="Alt plus Space">
        Alt&nbsp;&nbsp;Space
      </kbd>
    </div>
  );
}

function LauncherFooter({
  searching,
  statusLabel,
}: {
  searching: boolean;
  statusLabel?: string;
}) {
  return (
    <>
      <LauncherStatus label={statusLabel} searching={searching} />
      <span className="text-[color:var(--einui-command-muted-text)]">Local runtime</span>
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
  intentLocked?: boolean;
  onComputerSubmit?: (task: string) => void;
}

export function CollapsedLauncher({
  expandedContent,
  inputRef: providedInputRef,
  searching = false,
  statusLabel,
  windowService = defaultWindowService,
  onVoiceRequest,
  intentLocked = false,
  onComputerSubmit,
}: CollapsedLauncherProps) {
  const committedQuery = useQueryStore((state) => state.committed);
  const clearQuery = useQueryStore((state) => state.clear);
  const hide = useLauncherStore((state) => state.hide);
  const intent = useLauncherStore((state) => state.intent);
  const setIntent = useLauncherStore((state) => state.setIntent);
  const {reducedMotion} = useLumenMotion();
  const fallbackInputRef = useRef<HTMLInputElement>(null);
  const renderStartedAt = useRef(performance.now());
  const inputRef = providedInputRef ?? fallbackInputRef;
  const {expanded, presentationError} = useLauncherPresentation({
    hasContent: committedQuery.length > 0,
    reducedMotion,
    windowService,
  });

  useEffect(() => {
    inputRef.current?.focus();
    void windowService.focusInput();
    measureAfterPaint('launcher-visible', renderStartedAt.current);
  }, [inputRef, windowService]);

  const handleEscapeEmpty = () => {
    hide();
    void windowService.hide();
  };

  const handleIntentChange = () => {
    clearQuery();
    setIntent(intent === 'computer' ? 'search' : 'computer');
  };

  const visibleWorkspace = expanded ? expandedContent : null;

  return (
    <GlassCommandPalette
      aria-label="Lumen launcher"
      className={cn(
        'transition-[border-radius] duration-[160ms] ease-standard',
        expanded ? 'rounded-[var(--lumen-radius-surface)]' : 'rounded-[var(--lumen-radius-pill)]',
      )}
      composer={(
        <LauncherComposer
          inputRef={inputRef}
          intentLocked={intentLocked}
          onComputerSubmit={onComputerSubmit}
          onEscapeEmpty={handleEscapeEmpty}
          onIntentChange={handleIntentChange}
          onVoiceRequest={onVoiceRequest}
        />
      )}
      expanded={expanded}
      scopes={intent === 'search' ? <ScopeRail /> : null}
      body={visibleWorkspace}
      footer={(
        <LauncherFooter
          searching={searching}
          statusLabel={presentationError ?? statusLabel}
        />
      )}
    />
  );
}
