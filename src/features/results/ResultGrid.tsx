import {useMemo, useRef} from 'react';
import {GridList, type Key, type Selection} from 'react-aria-components';

import * as stylex from '@stylexjs/stylex';

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
  results: readonly SearchResult[];
  selectedId: string | null;
  maxHeight?: number;
  reducedMotion?: boolean;
  onSelectionChange?: (fileId: string | null) => void;
  onAction?: (fileId: string) => void;
}

export function ResultGrid({
  results,
  selectedId,
  maxHeight = 384,
  reducedMotion = false,
  onSelectionChange,
  onAction,
}: ResultGridProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
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
    <div {...stylex.props(styles.empty)}>
      <LumenText tone="secondary" variant="bodyLarge">
        No files found
      </LumenText>
    </div>
  );

  return (
    <div
      ref={viewportRef}
      {...stylex.props(styles.viewport)}
      style={{maxHeight, height: isVirtualized ? maxHeight : undefined}}
    >
      <SelectionCapsule
        containerRef={viewportRef}
        reducedMotion={reducedMotion}
        selectedId={selectedId}
      />
      {isVirtualized ? (
        <GridList
          aria-label="Search results"
          aria-rowcount={results.length}
          className={stylex.props(styles.grid).className}
          disabledKeys={disabledKeys}
          items={visibleResults}
          renderEmptyState={renderEmptyState}
          selectedKeys={selectedKeys}
          selectionBehavior="replace"
          selectionMode="single"
          style={{height: totalSize}}
          onAction={handleAction}
          onSelectionChange={handleSelectionChange}
        >
          {(entry) => (
            <ResultRow
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
          aria-label="Search results"
          aria-rowcount={results.length}
          className={stylex.props(styles.grid).className}
          disabledKeys={disabledKeys}
          items={results}
          renderEmptyState={renderEmptyState}
          selectedKeys={selectedKeys}
          selectionBehavior="replace"
          selectionMode="single"
          onAction={handleAction}
          onSelectionChange={handleSelectionChange}
        >
          {(result) => <ResultRow result={result} totalCount={results.length} />}
        </GridList>
      )}
    </div>
  );
}
