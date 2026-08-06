import {Suspense, useCallback, useEffect, useMemo, useRef, useState} from 'react';

import {motionTokens} from '../../design-system/motion';
import {createWindowService} from '../../platform/window/tauri-window-service';
import type {WindowService} from '../../platform/window/window-service';
import type {AnswerService} from '../../services/answer/answer-service';
import type {RuntimeMode} from '../../services/answer/answer.types';
import {UnavailableAnswerService} from '../../services/answer/unavailable-answer-service';
import {isNativeRuntime, nativeAiService} from '../../services/ai/native-ai-service';
import type {ComputerUseService} from '../../services/computer-use/computer-use-service';
import {UnavailableComputerUseService} from '../../services/computer-use/unavailable-computer-use-service';
import type {SearchService} from '../../services/search/search-service';
import {
  projectSearchPreferences,
  resolveSearchScope,
} from '../../services/search/search-preferences';
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
import {useSearchHistoryStore} from './search-history.store';
import {useScopeStore} from './scope.store';
import {
  readSelectionIntent,
  rememberSelectionIntent,
  useSelectionStore,
} from './selection.store';
import {useSearchController} from './useSearchController';

const defaultWindowService = createWindowService();
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
  computerUseService = unavailableComputerUseService,
  windowService = defaultWindowService,
  onOpenSettings,
}: SearchExperienceProps) {
  const searchSettings = useSettingsStore((state) => state.search);
  const searchPreferences = useMemo(
    () => projectSearchPreferences(searchSettings),
    [searchSettings],
  );
  const controller = useSearchController(service, searchPreferences);
  const intent = useLauncherStore((state) => state.intent);
  const runtimeMode = useSettingsStore((state) => state.ai.runtimeMode);
  const keepLocalWarm = useSettingsStore((state) => state.ai.keepLocalWarm);
  const cloudAnswerConsent = useSettingsStore((state) => state.ai.cloudAnswerConsent);
  const previewsEnabled = useSettingsStore((state) => state.privacy.previewsEnabled);
  const historyEnabled = useSettingsStore((state) => state.general.historyEnabled);
  const historyEntries = useSearchHistoryStore((state) => state.entries);
  const recordHistory = useSearchHistoryStore((state) => state.record);
  const updateAi = useSettingsStore((state) => state.updateAi);
  const computerUseSettings = useSettingsStore((state) => state.computerUse);
  const setActiveSettingsPage = useSettingsStore((state) => state.setActivePage);
  const committedQuery = useQueryStore((state) => state.committed);
  const answerStopRef = useRef<() => void>(() => undefined);
  const supersedeAnswer = useCallback(() => answerStopRef.current(), []);
  const answerRequest = useSettledAnswerQuery(supersedeAnswer);
  const answer = useAnswerController(answerService, {
    delayMs: 0,
    mode: runtimeMode,
    cloudConsent: cloudAnswerConsent,
    query: intent === 'search' ? answerRequest.query : '',
    restartKey: answerRequest.revision,
  });
  const computerUse = useComputerUseController(computerUseService, computerUseSettings);
  answerStopRef.current = answer.stop;
  const activeScope = useScopeStore((state) => state.activeScope);
  const setActiveScope = useScopeStore((state) => state.setScope);
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
  const history = useMemo(() => historyEntries.map((entry) => entry.query), [historyEntries]);
  const changeRuntimeMode = useCallback(async (nextMode: RuntimeMode) => {
    if (nextMode === runtimeMode) return;
    if (!isNativeRuntime()) {
      if (!await updateAi({runtimeMode: nextMode})) {
        throw new Error('The answer runtime could not be saved.');
      }
      return;
    }

    try {
      await nativeAiService.setLocalRuntimeMode(nextMode, keepLocalWarm);
    } catch {
      throw new Error('The native answer runtime did not accept that mode. Your saved setting was not changed.');
    }

    if (await updateAi({runtimeMode: nextMode})) return;

    useSettingsStore.setState((state) => ({
      ai: {...state.ai, runtimeMode},
    }));
    try {
      await nativeAiService.setLocalRuntimeMode(runtimeMode, keepLocalWarm);
    } catch {
      throw new Error('The answer runtime setting was not saved, and the native runtime could not be restored.');
    }
    throw new Error('The answer runtime setting was not saved. The native runtime was restored.');
  }, [keepLocalWarm, runtimeMode, updateAi]);

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
  const effectiveScope = resolveSearchScope(activeScope, searchPreferences);
  useEffect(() => {
    if (activeScope !== effectiveScope) {
      setActiveScope(effectiveScope);
    }
    controller.setScope(effectiveScope);
  }, [activeScope, controller.setScope, effectiveScope, setActiveScope]);
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
      if (historyEnabled) {
        void recordHistory(useQueryStore.getState().committed);
      }
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
    historyEnabled,
    recordHistory,
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
      if (historyEnabled) {
        void recordHistory(useQueryStore.getState().committed);
      }
      const result = controller.results.find((item) => item.id === fileId);
      setActionMessage(`Opened the folder containing ${result?.name ?? 'the result'}`);
    } catch (error) {
      setActionMessage(
        error instanceof Error ? error.message : 'The containing folder could not be opened.',
      );
    }
  }, [controller.results, controller.selectedId, historyEnabled, recordHistory, service]);

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

  const handleOpenSettings = useCallback(async (page?: 'computer-use') => {
    if (page) setActiveSettingsPage(page);
    showLauncher('settings');
    onOpenSettings?.();
    await windowService.show('settings');
  }, [onOpenSettings, setActiveSettingsPage, showLauncher, windowService]);

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
    history,
    historyEnabled,
    results: intent === 'search' ? controller.results : [],
    selectedId: controller.selectedId,
    onCloseDetails: () => setDetailsOpen(false),
    onOpen: handleOpen,
    onOpenContainingFolder: handleOpenContainingFolder,
    onOpenSettings: () => handleOpenSettings(),
    onRecallHistory: (query) => useQueryStore.getState().setDraft(query),
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
                onModeChange={changeRuntimeMode}
                onOpenCitation={(fileId) => void handleOpen(fileId)}
                onRetry={answer.retry}
                onStop={answer.stop}
              />
            )}
            error={controller.error}
            lifecycle={controller.lifecycle}
            openingId={openingId}
            previewsEnabled={previewsEnabled}
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
        enabledScopes={searchPreferences.enabledScopes}
        windowService={windowService}
        onComputerSubmit={handleSubmitComputerUse}
      />
      {detailsMounted ? (
        <Suspense fallback={null}>
          <LazyPreviewPane
            fileId={detailsFileId}
            isOpen={detailsOpen}
            mode="dialog"
            previewsEnabled={previewsEnabled}
            restoreFocusRef={inputRef}
            service={service}
            onOpenChange={setDetailsOpen}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
