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
import {PreviewPane} from '../preview/PreviewPane';
import {ResultGrid} from '../results/ResultGrid';
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
  selectedId: string | null;
  service: SearchService;
  onClearFilters(): void;
  onDetails(): void;
  onOpen(fileId?: string): void;
  onOpenContainingFolder(): void;
  onRemoveFilter(filter: SearchFilter): void;
  onSelectionChange(fileId: string | null): void;
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
  const selectedResult = results.find((result) => result.id === selectedId) ?? null;
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
          <ResultGrid
            emptyLabel={emptyLabel(lifecycle, error)}
            maxHeight={338}
            openingId={openingId}
            reducedMotion={reducedMotion}
            results={results}
            selectedId={selectedId}
            onAction={onOpen}
            onSelectionChange={onSelectionChange}
          />
        </section>
        <div {...stylex.props(styles.preview)}>
          <PreviewPane
            fileId={selectedId}
            reducedMotion={reducedMotion}
            service={service}
          />
        </div>
      </div>
      <ContextActions
        isOpening={openingId !== null}
        result={selectedResult}
        onDetails={onDetails}
        onOpen={onOpen}
        onOpenContainingFolder={onOpenContainingFolder}
      />
      <div
        aria-atomic="true"
        aria-live="polite"
        data-testid="search-announcement"
        {...stylex.props(styles.hiddenAnnouncement)}
      >
        {announcement}
      </div>
    </motion.section>
  );
}
