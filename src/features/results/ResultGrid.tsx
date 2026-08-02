import {useLayoutEffect, useMemo, useRef} from 'react';
import {GridList, type Key, type Selection} from 'react-aria-components';

import * as stylex from '@stylexjs/stylex';
import {motion} from 'motion/react';

import {motionTokens} from '../../design-system/motion';
import {LumenText} from '../../design-system/primitives/LumenText';
import {tokens} from '../../design-system/tokens.stylex';
import type {SearchResult} from '../../services/search/search.types';
import {ResultRow} from './ResultRow';
import {SelectionCapsule} from './SelectionCapsule';
import {useResultVirtualizer} from './useResultVirtualizer';

const styles = stylex.create({
  viewport: {
    position: 'relative',
    minWidth: 0,
    minHeight: 0,
    overflowY: 'auto',
    scrollbarColor: `${tokens.colorBorderStrong} transparent`,
    scrollbarWidth: 'thin',
  },
  grid: {
    position: 'relative',
    display: 'grid',
    alignContent: 'start',
    gap: tokens.space1,
    padding: tokens.space2,
    outline: 'none',
  },
  empty: {
    minHeight: '220px',
    display: 'grid',
    placeItems: 'center',
    padding: tokens.space12,
    textAlign: 'center',
  },
});

interface VirtualResult {
  id: string;
  index: number;
  result: SearchResult;
  start: number;
  size: number;
}

export interface ResultGridProps {
  animateRows?: boolean;
  emptyLabel?: string;
  openingId?: string | null;
  results: readonly SearchResult[];
  selectedId: string | null;
  maxHeight?: number;
  reducedMotion?: boolean;
  onSelectionChange?: (fileId: string | null) => void;
  onAction?: (fileId: string) => void;
}

export function ResultGrid({
  animateRows = false,
  emptyLabel = 'No files found',
  openingId = null,
  results,
  selectedId,
  maxHeight = 384,
  reducedMotion = false,
  onSelectionChange,
  onAction,
}: ResultGridProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const selectedKeys = useMemo(
    () => new Set<Key>(selectedId ? [selectedId] : []),
    [selectedId],
  );
  const disabledKeys = useMemo(
    () => new Set<Key>(
      results
        .filter((result) => (result.availability ?? 'available') !== 'available')
        .map((result) => result.id),
    ),
    [results],
  );
  const {isVirtualized, totalSize, virtualItems} = useResultVirtualizer(
    results.length,
    viewportRef,
    (index) => results[index]?.id ?? String(index),
    maxHeight,
  );
  const visibleResults = useMemo<readonly VirtualResult[]>(
    () => virtualItems.flatMap((item) => {
      const result = results[item.index];
      return result
        ? [{id: result.id, index: item.index, result, start: item.start, size: item.size}]
        : [];
    }),
    [results, virtualItems],
  );
  // Non-virtualized entries carry their index so the entrance cascade can stagger.
  const plainEntries = useMemo(
    () => results.map((result, index) => ({id: result.id, index, result})),
    [results],
  );

  useLayoutEffect(() => {
    gridRef.current?.setAttribute('aria-rowcount', String(results.length));
  }, [results.length]);

  useLayoutEffect(() => {
    const applySelection = (fileId: string | null) => {
      for (const row of gridRef.current?.querySelectorAll<HTMLElement>('[data-result-id]') ?? []) {
        const isSelected = row.dataset.resultId === fileId;
        row.setAttribute('aria-selected', String(isSelected));
        if (isSelected) row.setAttribute('data-selected', 'true');
        else row.removeAttribute('data-selected');
      }
    };
    const handlePreview = (event: Event) => {
      applySelection((event as CustomEvent<string | null>).detail);
    };
    applySelection(selectedId);
    window.addEventListener('lumen:selection-preview', handlePreview);
    return () => window.removeEventListener('lumen:selection-preview', handlePreview);
  }, [selectedId]);

  const handleSelectionChange = (selection: Selection) => {
    if (selection === 'all') {
      return;
    }
    const key = selection.values().next().value;
    onSelectionChange?.(key === undefined ? null : String(key));
  };
  const handleAction = onAction
    ? (key: Key) => onAction(String(key))
    : undefined;

  const renderEmptyState = () => (
    <motion.div
      {...stylex.props(styles.empty)}
      animate={{opacity: 1}}
      initial={reducedMotion ? false : {opacity: 0}}
      transition={{duration: motionTokens.duration.selection}}
    >
      <LumenText tone="secondary" variant="bodyLarge">
        {emptyLabel}
      </LumenText>
    </motion.div>
  );

  return (
    <div
      ref={viewportRef}
      {...stylex.props(styles.viewport)}
      style={{maxHeight, height: maxHeight}}
    >
      <SelectionCapsule
        containerRef={viewportRef}
        reducedMotion={reducedMotion}
        selectedId={selectedId}
      />
      {isVirtualized ? (
        <GridList
          ref={gridRef}
          aria-label="Search results"
          aria-rowcount={results.length}
          className={stylex.props(styles.grid).className}
          disabledKeys={disabledKeys}
          items={visibleResults}
          renderEmptyState={renderEmptyState}
          defaultSelectedKeys={selectedKeys}
          selectionBehavior="replace"
          selectionMode="single"
          style={{height: totalSize}}
          onAction={handleAction}
          onSelectionChange={handleSelectionChange}
        >
          {(entry) => (
            <ResultRow
              isOpening={entry.id === openingId}
              positionIndex={entry.index}
              positionStyle={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: entry.size,
                transform: `translateY(${entry.start}px)`,
              }}
              result={entry.result}
              totalCount={results.length}
            />
          )}
        </GridList>
      ) : (
        <GridList
          ref={gridRef}
          aria-label="Search results"
          aria-rowcount={results.length}
          className={stylex.props(styles.grid).className}
          disabledKeys={disabledKeys}
          items={plainEntries}
          renderEmptyState={renderEmptyState}
          defaultSelectedKeys={selectedKeys}
          selectionBehavior="replace"
          selectionMode="single"
          onAction={handleAction}
          onSelectionChange={handleSelectionChange}
        >
          {(entry) => (
            <ResultRow
              animateEntrance={animateRows}
              entranceIndex={entry.index}
              isOpening={entry.result.id === openingId}
              reducedMotion={reducedMotion}
              result={entry.result}
              totalCount={results.length}
            />
          )}
        </GridList>
      )}
    </div>
  );
}
