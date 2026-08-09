import {Suspense, useCallback, useEffect, useMemo, useRef, useState} from 'react';

import {motionTokens} from '../../design-system/motion';
import {createWindowService} from '../../platform/window/tauri-window-service';
import type {WindowService} from '../../platform/window/window-service';
import type {AnswerService} from '../../services/answer/answer-service';
import {UnavailableAnswerService} from '../../services/answer/unavailable-answer-service';
import type {ComputerUseService} from '../../services/computer-use/computer-use-service';
import {UnavailableComputerUseService} from '../../services/computer-use/unavailable-computer-use-service';
import type {SearchService} from '../../services/search/search-service';
import type {SearchFilter} from '../../services/search/search.types';
import {useLumenKeyboard} from '../keyboard/useLumenKeyboard';
import {ComputerUsePanel} from '../computer-use/ComputerUsePanel';
import {useComputerUseController} from '../computer-use/useComputerUseController';
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
import {requestWindowHide, requestWindowShow} from './useLauncherPresentation';

const unavailableAnswerService = new UnavailableAnswerService();
const unavailableComputerUseService = new UnavailableComputerUseService();

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
  computerUseService?: ComputerUseService;
  windowService?: WindowService;
  onOpenSettings?: () => void;
}

export function SearchExperience({
  service,
  answerService = unavailableAnswerService,
  computerUseService = unavailableComputerUseService,
  windowService: providedWindowService,
  onOpenSettings,
}: SearchExperienceProps) {
  const windowService = useMemo(
    () => providedWindowService ?? createWindowService(),
    [providedWindowService],
  );
  const controller = useSearchController(service);
  const intent = useLauncherStore((state) => state.intent);
  const runtimeMode = useSettingsStore((state) => state.ai.runtimeMode);
  const cloudAnswerConsent = useSettingsStore((state) => state.ai.cloudAnswerConsent);
  const updateAi = useSettingsStore((state) => state.updateAi);
  const computerUseSettings = useSettingsStore((state) => state.computerUse);
  const setActiveSettingsPage = useSettingsStore((state) => state.setActivePage);
  const committedQuery = useQueryStore((state) => state.committed);
  const submittedQuery = useQueryStore((state) => state.submitted);
  const submissionRevision = useQueryStore((state) => state.submissionRevision);
  const answer = useAnswerController(answerService, {
    delayMs: 0,
    mode: runtimeMode,
    cloudConsent: cloudAnswerConsent,
    query: intent === 'search' ? submittedQuery : '',
    restartKey: submissionRevision,
  });
  const computerUse = useComputerUseController(computerUseService, computerUseSettings);
  const activeScope = useScopeStore((state) => state.activeScope);
  const activeFilters = useScopeStore((state) => state.activeFilters);
  const clearFilters = useScopeStore((state) => state.clearFilters);
  const toggleFilter = useScopeStore((state) => state.toggleFilter);
  const mode = useLauncherStore((state) => state.mode);
  const visible = useLauncherStore((state) => state.visible);
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
      pendingFrame = window.requestAnimationFrame(() => controller.setQuery(
        intent === 'search' ? query : '',
      ));
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
  }, [controller.setQuery, intent]);
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
      const hidden = await requestWindowHide(windowService);
      if (!hidden) setActionMessage(`Opened ${result?.name ?? 'file'}, but Lumen could not hide.`);
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
    await requestWindowHide(windowService);
  }, [windowService]);

  const handleOpenSettings = useCallback(async (page?: 'computer-use') => {
    if (page) setActiveSettingsPage(page);
    const presentation = requestWindowShow(windowService, 'settings');
    onOpenSettings?.();
    await presentation;
  }, [onOpenSettings, setActiveSettingsPage, windowService]);

  const handleStartComputerUse = useCallback(() => {
    void computerUse.start(inputRef.current?.value ?? useQueryStore.getState().committed);
  }, [computerUse.start]);

  const handleSubmitComputerUse = useCallback((task: string) => {
    void computerUse.start(task);
  }, [computerUse.start]);

  const handleRemoveFilter = useCallback((filter: SearchFilter) => {
    toggleFilter(filter);
  }, [toggleFilter]);

  useLumenKeyboard({
    detailsOpen,
    inputRef,
    intent,
    isExpanded: mode === 'expanded',
    results: intent === 'search' ? controller.results : [],
    selectedId: controller.selectedId,
    onCloseDetails: () => setDetailsOpen(false),
    onOpen: handleOpen,
    onOpenContainingFolder: handleOpenContainingFolder,
    onOpenSettings: () => handleOpenSettings(),
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
    <div className="contents" data-launcher-visible={visible}>
      <CollapsedLauncher
        expandedContent={intent === 'computer' ? (
          <ComputerUsePanel
            cloudConsent={computerUseSettings.cloudConsent}
            controller={computerUse}
            draftTask={committedQuery}
            onOpenSettings={() => void handleOpenSettings('computer-use')}
            onStart={handleStartComputerUse}
          />
        ) : (
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
        intentLocked={computerUse.phase === 'starting' || computerUse.phase === 'running' || computerUse.phase === 'approval'}
        searching={intent === 'computer'
          ? computerUse.phase === 'starting' || computerUse.phase === 'running'
          : controller.lifecycle === 'searching'}
        statusLabel={intent === 'computer'
          ? computerUse.phase === 'approval' ? 'Approval'
            : computerUse.phase === 'completed' ? 'Done'
              : computerUse.phase === 'error' ? 'Unavailable'
                : computerUse.phase === 'running' || computerUse.phase === 'starting' ? 'Working'
                  : 'Browser agent'
          : statusLabel(controller.lifecycle, controller.results.length)}
        windowService={windowService}
        onComputerSubmit={handleSubmitComputerUse}
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
