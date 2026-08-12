import type {ReactNode} from 'react';
import {Suspense, useEffect, useRef, useState} from 'react';

import {motion} from 'motion/react';

import {useMediaPreference} from '../../app/AppProviders';
import {useLumenMotion} from '../../design-system/MotionProvider';
import type {SearchService} from '../../services/search/search-service';
import {useAppearanceStore} from '../../state/appearance.store';
import type {
  SearchError,
  SearchFilter,
  SearchResult,
} from '../../services/search/search.types';
import {LazyPreviewPane} from '../preview/LazyPreviewPane';
import {ResultGrid} from '../results/ResultGrid';
import {ContextActions} from './ContextActions';
import {FilterChips} from './FilterChips';
import {useSelectionStore} from './selection.store';
import type {SearchLifecycle} from './useSearchController';

export interface ExpandedWorkspaceProps {
  activeFilters: readonly SearchFilter[];
  announcement: string;
  answerPanel?: ReactNode;
  error: SearchError | null;
  lifecycle: SearchLifecycle;
  openingId: string | null;
  results: readonly SearchResult[];
  selectedId?: string | null;
  service: SearchService;
  onClearFilters(): void;
  onDetails(): void;
  onOpen(fileId?: string): void;
  onOpenContainingFolder(): void;
  onRemoveFilter(filter: SearchFilter): void;
  onSelectionChange(fileId: string | null): void;
}

function SelectionBoundResults({
  openingId,
  reducedMotion,
  results,
  selectedId: selectedIdOverride,
  emptyState,
  onOpen,
  onSelectionChange,
}: {
  openingId: string | null;
  reducedMotion: boolean;
  results: readonly SearchResult[];
  selectedId?: string | null;
  emptyState: string;
  onOpen(fileId?: string): void;
  onSelectionChange(fileId: string | null): void;
}) {
  const requestedSelectedId = selectedIdOverride === undefined
    ? useSelectionStore.getState().selectedId
    : selectedIdOverride;
  const selectedId = results.some((item) => item.id === requestedSelectedId)
    ? requestedSelectedId
    : results.find((item) => (item.availability ?? 'available') === 'available')?.id ?? null;
  const generation = useRef(0);
  const previousResults = useRef(results);
  if (previousResults.current !== results) {
    previousResults.current = results;
    generation.current += 1;
  }
  return (
    <ResultGrid
      key={`${results[0]?.id ?? 'empty'}-${results.length}`}
      animateRows={generation.current > 1}
      emptyLabel={emptyState}
      maxHeight={338}
      openingId={openingId}
      reducedMotion={reducedMotion}
      results={results}
      selectedId={selectedId}
      onAction={onOpen}
      onSelectionChange={onSelectionChange}
    />
  );
}

function useSettledSelection(delayMs = 48) {
  const [selectedId, setSelectedId] = useState(
    () => useSelectionStore.getState().selectedId,
  );
  useEffect(() => {
    let pending = 0;
    const unsubscribe = useSelectionStore.subscribe(
      (state) => state.selectedId,
      (nextId) => {
        window.clearTimeout(pending);
        pending = window.setTimeout(() => setSelectedId(nextId), delayMs);
      },
    );
    return () => {
      window.clearTimeout(pending);
      unsubscribe();
    };
  }, [delayMs]);
  return selectedId;
}

function SelectionBoundPreview({
  reducedMotion,
  selectedId: selectedIdOverride,
  service,
}: {
  reducedMotion: boolean;
  selectedId?: string | null;
  service: SearchService;
}) {
  const settledSelectedId = useSettledSelection();
  const fileId = selectedIdOverride === undefined
    ? settledSelectedId
    : selectedIdOverride;
  return <LazyPreviewPane fileId={fileId} reducedMotion={reducedMotion} service={service} />;
}

function SelectionBoundActions({
  isOpening,
  results,
  selectedId: selectedIdOverride,
  onDetails,
  onOpen,
  onOpenContainingFolder,
}: {
  isOpening: boolean;
  results: readonly SearchResult[];
  selectedId?: string | null;
  onDetails(): void;
  onOpen(fileId?: string): void;
  onOpenContainingFolder(): void;
}) {
  const storedSelectedId = useSelectionStore((state) => state.selectedId);
  const selectedId = selectedIdOverride === undefined
    ? storedSelectedId
    : selectedIdOverride;
  const result = results.find((item) => item.id === selectedId) ?? null;
  return (
    <ContextActions
      isOpening={isOpening}
      result={result}
      onDetails={onDetails}
      onOpen={onOpen}
      onOpenContainingFolder={onOpenContainingFolder}
    />
  );
}

function SelectionAnnouncement({
  announcement,
  results,
  selectedId: selectedIdOverride,
}: {
  announcement: string;
  results: readonly SearchResult[];
  selectedId?: string | null;
}) {
  const announcementRef = useRef<HTMLDivElement>(null);
  const storedSelectedId = useSelectionStore((state) => state.selectedId);
  const selectedId = selectedIdOverride === undefined
    ? storedSelectedId
    : selectedIdOverride;
  const selectedResult = results.find((result) => result.id === selectedId);
  useEffect(() => {
    const announcePreviewSelection = (event: Event) => {
      const fileId = (event as CustomEvent<string | null>).detail;
      const result = results.find((item) => item.id === fileId);
      if (announcementRef.current) {
        announcementRef.current.textContent = [announcement, result ? `${result.name} selected` : '']
          .filter(Boolean)
          .join('. ');
      }
    };
    window.addEventListener('lumen:selection-preview', announcePreviewSelection);
    return () => window.removeEventListener('lumen:selection-preview', announcePreviewSelection);
  }, [announcement, results]);
  return (
    <div
      ref={announcementRef}
      aria-atomic="true"
      aria-live="polite"
      className="sr-only"
      data-testid="search-announcement"
    >
      {[announcement, selectedResult ? `${selectedResult.name} selected` : '']
        .filter(Boolean)
        .join('. ')}
    </div>
  );
}

function emptyLabel(lifecycle: SearchLifecycle, error: SearchError | null) {
  if (lifecycle === 'searching') return 'Searching local files…';
  if (lifecycle === 'error') return error?.message ?? 'Search could not be completed.';
  return 'No files found';
}

export function ExpandedWorkspace({
  activeFilters,
  announcement,
  answerPanel,
  error,
  lifecycle,
  openingId,
  results,
  selectedId,
  service,
  onClearFilters,
  onDetails,
  onOpen,
  onOpenContainingFolder,
  onRemoveFilter,
  onSelectionChange,
}: ExpandedWorkspaceProps) {
  const {opacityDuration, reducedMotion} = useLumenMotion();
  const preview = useAppearanceStore((state) => state.preview);
  const atMinimumPreviewWidth = useMediaPreference('(min-width: 760px)');
  const atAutomaticPreviewWidth = useMediaPreference('(min-width: 900px)');
  const showInlinePreview = preview === 'always'
    ? atMinimumPreviewWidth
    : preview === 'automatic' && atAutomaticPreviewWidth;
  const countLabel = lifecycle === 'searching'
    ? 'Searching'
    : `${results.length} ${results.length === 1 ? 'result' : 'results'}`;

  return (
    <motion.section
      aria-label="Search workspace"
      animate={{opacity: 1, y: 0}}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-t border-[color:var(--einui-command-divider)]"
      initial={reducedMotion ? {opacity: 0} : {opacity: 0, y: -6}}
      transition={{duration: opacityDuration}}
    >
      <FilterChips filters={activeFilters} onClear={onClearFilters} onRemove={onRemoveFilter} />
      {answerPanel}
      <div className={showInlinePreview
        ? 'grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(280px,38%)] overflow-hidden'
        : 'grid min-h-0 min-w-0 flex-1 grid-cols-1 overflow-hidden'}>
        <section aria-label="Search result list" className="flex min-h-0 min-w-0 flex-col">
          <header className="flex min-h-[34px] items-center justify-between gap-3 px-4">
            <span className="font-sans text-xs font-medium text-[color:var(--einui-command-text)]">Local results</span>
            <span className="font-sans text-[0.6875rem] text-[color:var(--einui-command-muted-text)]">{countLabel}</span>
          </header>
          <SelectionBoundResults
            emptyState={emptyLabel(lifecycle, error)}
            openingId={openingId}
            reducedMotion={reducedMotion}
            results={results}
            selectedId={selectedId}
            onOpen={onOpen}
            onSelectionChange={onSelectionChange}
          />
        </section>
        {showInlinePreview ? <div className="min-h-0 min-w-0">
          <Suspense fallback={<div aria-label="File preview" className="grid min-h-[320px] place-items-center font-sans text-xs text-[color:var(--einui-command-muted-text)]">Preparing preview…</div>}>
            <SelectionBoundPreview reducedMotion={reducedMotion} selectedId={selectedId} service={service} />
          </Suspense>
        </div> : null}
      </div>
      <SelectionBoundActions
        isOpening={openingId !== null}
        results={results}
        selectedId={selectedId}
        onDetails={onDetails}
        onOpen={onOpen}
        onOpenContainingFolder={onOpenContainingFolder}
      />
      <SelectionAnnouncement announcement={announcement} results={results} selectedId={selectedId} />
    </motion.section>
  );
}
