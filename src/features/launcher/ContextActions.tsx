import {memo, useLayoutEffect, useMemo, useRef} from 'react';

import {LumenUiIcon} from '../../design-system/icons/LumenUiIcon';
import {Button} from '@fluentui/react-components';
import type {SearchResult} from '../../services/search/search.types';

export interface ContextActionsProps {
  isOpening?: boolean;
  result: SearchResult | null;
  onDetails(): void;
  onOpen(): void;
  onOpenContainingFolder(): void;
  onPin(): void;
}

export function ContextActions({
  isOpening = false,
  result,
  onDetails,
  onOpen,
  onOpenContainingFolder,
  onPin,
}: ContextActionsProps) {
  const actions = useRef({onDetails, onOpen, onOpenContainingFolder, onPin});
  useLayoutEffect(() => {
    actions.current = {onDetails, onOpen, onOpenContainingFolder, onPin};
  }, [onDetails, onOpen, onOpenContainingFolder, onPin]);
  const stableActions = useMemo(() => ({
    onDetails: () => actions.current.onDetails(),
    onOpen: () => actions.current.onOpen(),
    onOpenContainingFolder: () => actions.current.onOpenContainingFolder(),
    onPin: () => actions.current.onPin(),
  }), []);
  return (
    <div
      aria-label="Result actions"
      className="flex min-w-0 shrink-0 items-center gap-1"
    >
      <span
        className="sr-only"
        title={result?.path}
      >
        {result ? result.name : 'Choose a result for actions'}
      </span>
      <ActionButtons
        hasResult={result !== null}
        isOpening={isOpening}
        isAppContent={result?.kind === 'app-content'}
        canPin={Boolean(result?.provenance)}
        pinned={Boolean(result?.pinned)}
        {...stableActions}
      />
    </div>
  );
}

// Selection text changes every row; button work only changes with eligibility.
const ActionButtons = memo(function ActionButtons({
  hasResult, isOpening, isAppContent, canPin, pinned,
  onDetails, onOpen, onOpenContainingFolder, onPin,
}: Omit<ContextActionsProps, 'result'> & {
  hasResult: boolean;
  isAppContent: boolean;
  canPin: boolean;
  pinned: boolean;
}) {
  return <>
      <Button data-launcher-control
        aria-label={isOpening ? 'Opening selected result' : 'Open selected result'}
        className="gap-1.5 px-2 text-[color:var(--einui-command-text)]"
        disabled={!hasResult || isOpening}
        size="small"
        appearance="subtle"
        onClick={onOpen}
      >
        <LumenUiIcon name="forward" size="small" />
        <span>{isOpening ? 'Opening' : 'Open'}</span>
        <kbd aria-hidden="true" className="ml-1 font-sans text-xs text-[color:var(--einui-command-muted-text)]">↵</kbd>
      </Button>
      <Button data-launcher-control
        aria-label="Open containing folder"
        data-action-secondary
        disabled={!hasResult || isAppContent}
        size="small"
        appearance="subtle"
        onClick={onOpenContainingFolder}
      >
        <LumenUiIcon name="folderOpen" size="small" />
        <span className="hidden @min-[40rem]/footer:inline">Folder</span>
      </Button>
      <Button data-launcher-control
        aria-label={pinned ? 'Unpin selected result' : 'Pin selected result'}
        data-action-secondary
        disabled={!canPin}
        size="small"
        appearance="subtle"
        onClick={onPin}
      >
        <LumenUiIcon name={pinned ? 'pinned' : 'pin'} size="small" />
        <span className="hidden @min-[40rem]/footer:inline">{pinned ? 'Unpin' : 'Pin'}</span>
      </Button>
      <Button data-launcher-control
        aria-label="Show file details"
        data-action-secondary
        disabled={!hasResult}
        size="small"
        appearance="subtle"
        onClick={onDetails}
      >
        <LumenUiIcon name="info" size="small" />
        <span className="hidden @min-[40rem]/footer:inline">Details</span>
      </Button>
    </>;
});
