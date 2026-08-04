import {Suspense, useCallback, useEffect, useMemo, useRef, useState} from 'react';

import {motionTokens} from '../../design-system/motion';
import {createWindowService} from '../../platform/window/tauri-window-service';
import type {WindowService} from '../../platform/window/window-service';
import type {AnswerService} from '../../services/answer/answer-service';
import {UnavailableAnswerService} from '../../services/answer/unavailable-answer-service';
import type {SearchService} from '../../services/search/search-service';
import type {SearchFilter} from '../../services/search/search.types';
import {useLumenKeyboard} from '../keyboard/useLumenKeyboard';
import {measureAfterPaint} from '../diagnostics/diagnostics.metrics';
import {AnswerPanel} from '../answer/AnswerPanel';
import {useAnswerController} from '../answer/useAnswerController';
import {LazyPreviewPane} from '../preview/LazyPreviewPane';
import {useSettingsStore} from '../settings/settings.store';
import {CollapsedLauncher} from './CollapsedLauncher';
import {ExpandedWorkspace} from './ExpandedWorkspace';
import {useLauncherStore} from './launcher.store';
import {useQueryStore} from './query.store';
import {useScopeStore} from './scope.store';
import {
  readSelectionIntent,
  rememberSelectionIntent,
  useSelectionStore,
} from './selection.store';
import {useSearchController} from './useSearchController';

const defaultWindowService = createWindowService();
const unavailableAnswerService = new UnavailableAnswerService();

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

function statusLabel(
  lifecycle: ReturnType<typeof useSearchController>['lifecycle'],
  count: number,
) {
  if (lifecycle === 'searching') {
    return 'Searching';
  }
  if (lifecycle === 'error') {
    return 'Unavailable';
  }
  if (lifecycle === 'ready' || lifecycle === 'empty') {
    return `${count} ${count === 1 ? 'result' : 'results'}`;
  }
  return 'Ready';
}

export interface SearchExperienceProps {
  service: SearchService;
  answerService?: AnswerService;
  windowService?: WindowService;
  onOpenSettings?: () => void;
}

function useSettledAnswerQuery(onSupersede: () => void) {
  const [request, setRequest] = useState({query: '', revision: 0});

  useEffect(() => {
    let pending = 0;
    const settle = (query: string) => {
      window.clearTimeout(pending);
      onSupersede();
      if (!query.trim()) {
        setRequest((current) => current.query
          ? {query: '', revision: current.revision + 1}
          : current);
        return;
      }
      pending = window.setTimeout(() => {
        setRequest((current) => ({query, revision: current.revision + 1}));
      }, 350);
    };
    settle(useQueryStore.getState().committed);
    const unsubscribe = useQueryStore.subscribe((state) => state.committed, settle);
    return () => {
      window.clearTimeout(pending);
      unsubscribe();
    };
  }, [onSupersede]);

  return request;
}

export function SearchExperience({
  service,
  answerService = unavailableAnswerService,
  windowService = defaultWindowService,
  onOpenSettings,
}: SearchExperienceProps) {
  const controller = useSearchController(service);
  const runtimeMode = useSettingsStore((state) => state.ai.runtimeMode);
  const updateAi = useSettingsStore((state) => state.updateAi);
  const answerStopRef = useRef<() => void>(() => undefined);
  const supersedeAnswer = useCallback(() => answerStopRef.current(), []);
  const answerRequest = useSettledAnswerQuery(supersedeAnswer);
  const answer = useAnswerController(answerService, {
    delayMs: 0,
    mode: runtimeMode,
    query: answerRequest.query,
    restartKey: answerRequest.revision,
  });
  answerStopRef.current = answer.stop;
  const activeScope = useScopeStore((state) => state.activeScope);
  const activeFilters = useScopeStore((state) => state.activeFilters);
  const clearFilters = useScopeStore((state) => state.clearFilters);
  const toggleFilter = useScopeStore((state) => state.toggleFilter);
  const mode = useLauncherStore((state) => state.mode);
  const visible = useLauncherStore((state) => state.visible);
  const hideLauncher = useLauncherStore((state) => state.hide);
  const showLauncher = useLauncherStore((state) => state.show);
  const selectStoreResult = useSelectionStore((state) => state.select);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsMounted, setDetailsMounted] = useState(false);
  const [detailsFileId, setDetailsFileId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingSelectionFrame = useRef(0);
  const pendingSelectionTimer = useRef(0);

  useEffect(() => () => {
    window.cancelAnimationFrame(pendingSelectionFrame.current);
    window.clearTimeout(pendingSelectionTimer.current);
  }, []);

  useEffect(() => {
    let pendingFrame = 0;
    const scheduleQuery = (query: string) => {
      window.cancelAnimationFrame(pendingFrame);
      pendingFrame = window.requestAnimationFrame(() => controller.setQuery(query));
    };
    scheduleQuery(useQueryStore.getState().committed);
    const unsubscribe = useQueryStore.subscribe(
      (state) => state.committed,
      scheduleQuery,
    );
    return () => {
      window.cancelAnimationFrame(pendingFrame);
      unsubscribe();
    };
  }, [controller.setQuery]);
  useEffect(
    () => controller.setScope(activeScope),
    [activeScope, controller.setScope],
  );
  useEffect(
    () => {
      selectStoreResult(controller.selectedId);
      window.dispatchEvent(new CustomEvent('lumen:selection-preview', {
        detail: controller.selectedId,
      }));
    },
    [controller.selectedId, selectStoreResult],
  );
  useEffect(() => {
    setActionMessage('');
    if (!controller.selectedId) {
      setDetailsOpen(false);
    }
  }, [controller.selectedId]);

  const handleSelect = useCallback((fileId: string | null) => {
    const startedAt = performance.now();
    controller.rememberSelection(fileId);
    rememberSelectionIntent(fileId);
    window.dispatchEvent(new CustomEvent('lumen:selection-preview', {detail: fileId}));
    measureAfterPaint('selection-paint', startedAt);
    window.cancelAnimationFrame(pendingSelectionFrame.current);
    window.clearTimeout(pendingSelectionTimer.current);
    pendingSelectionFrame.current = window.requestAnimationFrame(() => {
      pendingSelectionTimer.current = window.setTimeout(() => selectStoreResult(fileId), 0);
    });
  }, [controller.rememberSelection, selectStoreResult]);

  const handleOpen = useCallback(async (requestedId?: string) => {
    const fileId = requestedId ?? readSelectionIntent() ?? controller.selectedId;
    if (!fileId || openingId) {
      return;
    }
    const result = controller.results.find((item) => item.id === fileId);
    setOpeningId(fileId);
    setActionMessage(`Opening ${result?.name ?? 'file'}`);
    try {
      await service.openFile(fileId);
      await delay(motionTokens.duration.press * 1000);
      hideLauncher();
      await windowService.hide();
    } catch (error) {
      setActionMessage(
        error instanceof Error ? error.message : 'The selected file could not be opened.',
      );
    } finally {
      setOpeningId(null);
    }
  }, [
    controller.selectedId,
    controller.results,
    hideLauncher,
    openingId,
    service,
    windowService,
  ]);

  const handleOpenContainingFolder = useCallback(async () => {
    const fileId = readSelectionIntent() ?? controller.selectedId;
    if (!fileId) {
      return;
    }
    try {
      await service.openContainingFolder(fileId);
      const result = controller.results.find((item) => item.id === fileId);
      setActionMessage(`Opened the folder containing ${result?.name ?? 'the result'}`);
    } catch (error) {
      setActionMessage(
        error instanceof Error ? error.message : 'The containing folder could not be opened.',
      );
    }
  }, [controller.results, controller.selectedId, service]);

  const handleShowDetails = useCallback(() => {
    const fileId = readSelectionIntent() ?? controller.selectedId;
    if (fileId) {
      setDetailsFileId(fileId);
      setDetailsMounted(true);
      setDetailsOpen(true);
    }
  }, [controller.selectedId]);

  const handleRequestHide = useCallback(async () => {
    hideLauncher();
    await windowService.hide();
  }, [hideLauncher, windowService]);

  const handleOpenSettings = useCallback(async () => {
    showLauncher('settings');
    onOpenSettings?.();
    await windowService.show('settings');
  }, [onOpenSettings, showLauncher, windowService]);

  const handleRemoveFilter = useCallback((filter: SearchFilter) => {
    toggleFilter(filter);
  }, [toggleFilter]);

  useLumenKeyboard({
    detailsOpen,
    inputRef,
    isExpanded: mode === 'expanded',
    results: controller.results,
    selectedId: controller.selectedId,
    onCloseDetails: () => setDetailsOpen(false),
    onOpen: handleOpen,
    onOpenContainingFolder: handleOpenContainingFolder,
    onOpenSettings: handleOpenSettings,
    onRequestHide: handleRequestHide,
    onSelect: handleSelect,
    onShowDetails: handleShowDetails,
  });

  const announcement = useMemo(() => {
    if (actionMessage) {
      return actionMessage;
    }
    if (controller.lifecycle === 'searching') {
      return 'Searching local files';
    }
    if (controller.lifecycle === 'error') {
      return controller.error?.message ?? 'Search is unavailable';
    }
    if (controller.lifecycle === 'empty') {
      return 'No results';
    }
    if (controller.lifecycle === 'ready') {
      return `${controller.results.length} ${controller.results.length === 1 ? 'result' : 'results'}`;
    }
    return 'Lumen is ready';
  }, [
    actionMessage,
    controller.error?.message,
    controller.lifecycle,
    controller.results.length,
  ]);

  return (
    <div data-launcher-visible={visible} style={{display: 'contents'}}>
      <CollapsedLauncher
        expandedContent={(
          <ExpandedWorkspace
            activeFilters={activeFilters}
            announcement={announcement}
            answerPanel={(
              <AnswerPanel
                answer={answer}
                mode={runtimeMode}
                onModeChange={(nextMode) => void updateAi({runtimeMode: nextMode})}
                onOpenCitation={(fileId) => void handleOpen(fileId)}
                onRetry={answer.retry}
                onStop={answer.stop}
              />
            )}
            error={controller.error}
            lifecycle={controller.lifecycle}
            openingId={openingId}
            results={controller.results}
            service={service}
            onClearFilters={clearFilters}
            onDetails={handleShowDetails}
            onOpen={handleOpen}
            onOpenContainingFolder={handleOpenContainingFolder}
            onRemoveFilter={handleRemoveFilter}
            onSelectionChange={handleSelect}
          />
        )}
        inputRef={inputRef}
        searching={controller.lifecycle === 'searching'}
        statusLabel={statusLabel(controller.lifecycle, controller.results.length)}
        windowService={windowService}
      />
      {detailsMounted ? (
        <Suspense fallback={null}>
          <LazyPreviewPane
            fileId={detailsFileId}
            isOpen={detailsOpen}
            mode="dialog"
            restoreFocusRef={inputRef}
            service={service}
            onOpenChange={setDetailsOpen}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
