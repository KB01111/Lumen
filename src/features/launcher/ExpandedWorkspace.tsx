import {Suspense, useEffect, useRef, useState} from 'react';

import * as stylex from '@stylexjs/stylex';
import {motion} from 'motion/react';

import {useLumenMotion} from '../../design-system/MotionProvider';
import {LumenText} from '../../design-system/primitives/LumenText';
import {tokens} from '../../design-system/tokens.stylex';
import type {SearchService} from '../../services/search/search-service';
import type {
  SearchError,
  SearchFilter,
  SearchResult,
} from '../../services/search/search.types';
import {LazyPreviewPane} from '../preview/LazyPreviewPane';
import {ResultGrid} from '../results/ResultGrid';
import {useSelectionStore} from './selection.store';
import type {SearchLifecycle} from './useSearchController';
import {ContextActions} from './ContextActions';
import {FilterChips} from './FilterChips';

const styles = stylex.create({
  root: {
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    overflow: 'hidden',
    borderTopColor: tokens.colorBorderSubtle,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
  },
  instrument: {
    minWidth: 0,
    minHeight: 0,
    display: 'grid',
    flex: 1,
    gridTemplateColumns: {
      default: 'minmax(0, 1fr) minmax(280px, 38%)',
      '@media (max-width: 759px)': 'minmax(0, 1fr)',
    },
    overflow: 'hidden',
  },
  results: {
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  resultsHeader: {
    minHeight: '34px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.space6,
    paddingInline: tokens.space8,
  },
  preview: {
    minWidth: 0,
    minHeight: 0,
    height: '100%',
    display: {
      default: 'block',
      '@media (max-width: 759px)': 'none',
    },
  },
  previewFallback: {
    minHeight: '320px',
    display: 'grid',
    placeItems: 'center',
    color: tokens.colorTextTertiary,
    fontFamily: tokens.fontFamilyText,
    fontSize: tokens.fontSizeMeta,
  },
  hiddenAnnouncement: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
});

export interface ExpandedWorkspaceProps {
  activeFilters: readonly SearchFilter[];
  announcement: string;
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
  // Count result-set generations: the first set arrives together with the
  // workspace reveal, so the row cascade only plays on refinements.
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
  return (
    <LazyPreviewPane
      fileId={fileId}
      reducedMotion={reducedMotion}
      service={service}
    />
  );
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
  const storedSelectedId = useSelectionStore((state) => state.selectedId);
  const selectedId = selectedIdOverride === undefined
    ? storedSelectedId
    : selectedIdOverride;
  const selectedResult = results.find((result) => result.id === selectedId);
  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      data-testid="search-announcement"
      {...stylex.props(styles.hiddenAnnouncement)}
    >
      {[announcement, selectedResult ? `${selectedResult.name} selected` : '']
        .filter(Boolean)
        .join('. ')}
    </div>
  );
}

function emptyLabel(lifecycle: SearchLifecycle, error: SearchError | null) {
  if (lifecycle === 'searching') {
    return 'Searching local files…';
  }
  if (lifecycle === 'error') {
    return error?.message ?? 'Search could not be completed.';
  }
  return 'No files found';
}

export function ExpandedWorkspace({
  activeFilters,
  announcement,
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
  const countLabel = lifecycle === 'searching'
    ? 'Searching'
    : `${results.length} ${results.length === 1 ? 'result' : 'results'}`;

  return (
    <motion.section
      aria-label="Search workspace"
      {...stylex.props(styles.root)}
      initial={reducedMotion ? {opacity: 0} : {opacity: 0, y: -6}}
      animate={{opacity: 1, y: 0}}
      transition={{duration: opacityDuration}}
    >
      <FilterChips filters={activeFilters} onClear={onClearFilters} onRemove={onRemoveFilter} />
      <div {...stylex.props(styles.instrument)}>
        <section aria-label="Search result list" {...stylex.props(styles.results)}>
          <header {...stylex.props(styles.resultsHeader)}>
            <LumenText tone="secondary" variant="meta" weight="medium">Local results</LumenText>
            <LumenText tone="tertiary" variant="caption">{countLabel}</LumenText>
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
        <div {...stylex.props(styles.preview)}>
          <Suspense
            fallback={(
              <div aria-label="File preview" {...stylex.props(styles.previewFallback)}>
                Preparing preview…
              </div>
            )}
          >
            <SelectionBoundPreview
              reducedMotion={reducedMotion}
              selectedId={selectedId}
              service={service}
            />
          </Suspense>
        </div>
      </div>
      <SelectionBoundActions
        isOpening={openingId !== null}
        results={results}
        selectedId={selectedId}
        onDetails={onDetails}
        onOpen={onOpen}
        onOpenContainingFolder={onOpenContainingFolder}
      />
      <SelectionAnnouncement
        announcement={announcement}
        results={results}
        selectedId={selectedId}
      />
    </motion.section>
  );
}
