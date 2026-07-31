import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import {motionTokens} from '../../design-system/motion';
import {createWindowService} from '../../platform/window/tauri-window-service';
import type {WindowService} from '../../platform/window/window-service';
import type {SearchService} from '../../services/search/search-service';
import type {SearchFilter} from '../../services/search/search.types';
import {useLumenKeyboard} from '../keyboard/useLumenKeyboard';
import {PreviewPane} from '../preview/PreviewPane';
import {CollapsedLauncher} from './CollapsedLauncher';
import {ExpandedWorkspace} from './ExpandedWorkspace';
import {useLauncherStore} from './launcher.store';
import {useQueryStore} from './query.store';
import {useScopeStore} from './scope.store';
import {useSelectionStore} from './selection.store';
import {useSearchController} from './useSearchController';

const defaultWindowService = createWindowService();

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
  windowService?: WindowService;
  onOpenSettings?: () => void;
}

export function SearchExperience({
  service,
  windowService = defaultWindowService,
  onOpenSettings,
}: SearchExperienceProps) {
  const controller = useSearchController(service);
  const committedQuery = useQueryStore((state) => state.committed);
  const activeScope = useScopeStore((state) => state.activeScope);
  const activeFilters = useScopeStore((state) => state.activeFilters);
  const clearFilters = useScopeStore((state) => state.clearFilters);
  const toggleFilter = useScopeStore((state) => state.toggleFilter);
  const mode = useLauncherStore((state) => state.mode);
  const hideLauncher = useLauncherStore((state) => state.hide);
  const showLauncher = useLauncherStore((state) => state.show);
  const selectStoreResult = useSelectionStore((state) => state.select);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => controller.setQuery(committedQuery),
    [committedQuery, controller.setQuery],
  );
  useEffect(
    () => controller.setScope(activeScope),
    [activeScope, controller.setScope],
  );
  useEffect(
    () => selectStoreResult(controller.selectedId),
    [controller.selectedId, selectStoreResult],
  );
  useEffect(() => {
    setActionMessage('');
    if (!controller.selectedId) {
      setDetailsOpen(false);
    }
  }, [controller.selectedId]);

  const selectedResult = useMemo(
    () => controller.results.find((result) => result.id === controller.selectedId) ?? null,
    [controller.results, controller.selectedId],
  );

  const handleSelect = useCallback((fileId: string | null) => {
    controller.select(fileId);
    selectStoreResult(fileId);
  }, [controller.select, selectStoreResult]);

  const handleOpen = useCallback(async (requestedId?: string) => {
    const fileId = requestedId ?? controller.selectedId;
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
    const fileId = controller.selectedId;
    if (!fileId) {
      return;
    }
    try {
      await service.openContainingFolder(fileId);
      setActionMessage(`Opened the folder containing ${selectedResult?.name ?? 'the result'}`);
    } catch (error) {
      setActionMessage(
        error instanceof Error ? error.message : 'The containing folder could not be opened.',
      );
    }
  }, [controller.selectedId, selectedResult?.name, service]);

  const handleShowDetails = useCallback(() => {
    if (controller.selectedId) {
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
      return [
        `${controller.results.length} ${controller.results.length === 1 ? 'result' : 'results'}`,
        selectedResult ? `${selectedResult.name} selected` : '',
      ].filter(Boolean).join('. ');
    }
    return 'Lumen is ready';
  }, [
    actionMessage,
    controller.error?.message,
    controller.lifecycle,
    controller.results.length,
    selectedResult,
  ]);

  return (
    <>
      <CollapsedLauncher
        expandedContent={(
          <ExpandedWorkspace
            activeFilters={activeFilters}
            announcement={announcement}
            error={controller.error}
            lifecycle={controller.lifecycle}
            openingId={openingId}
            results={controller.results}
            selectedId={controller.selectedId}
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
        statusLabel={statusLabel(controller.lifecycle, controller.results.length)}
        windowService={windowService}
      />
      <PreviewPane
        fileId={controller.selectedId}
        isOpen={detailsOpen}
        mode="dialog"
        restoreFocusRef={inputRef}
        service={service}
        onOpenChange={setDetailsOpen}
      />
    </>
  );
}
