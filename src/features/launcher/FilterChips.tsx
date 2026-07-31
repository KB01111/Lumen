import {XIcon} from '@phosphor-icons/react';
import * as stylex from '@stylexjs/stylex';

import {LumenButton} from '../../design-system/primitives/LumenButton';
import {LumenText} from '../../design-system/primitives/LumenText';
import {tokens} from '../../design-system/tokens.stylex';
import type {SearchFilter} from '../../services/search/search.types';

const styles = stylex.create({
  root: {
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: tokens.space4,
    paddingBlock: tokens.space3,
    paddingInline: tokens.space6,
    overflowX: 'auto',
    scrollbarWidth: 'none',
    borderBottomColor: tokens.colorBorderSubtle,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
  },
  label: {flexShrink: 0, paddingInline: tokens.space2},
  chip: {
    flexShrink: 0,
    borderRadius: tokens.radiusRound,
  },
  clear: {
    flexShrink: 0,
    marginInlineStart: 'auto',
  },
});

export interface FilterChipsProps {
  filters: readonly SearchFilter[];
  onClear(): void;
  onRemove(filter: SearchFilter): void;
}

export function FilterChips({filters, onClear, onRemove}: FilterChipsProps) {
  if (filters.length === 0) {
    return null;
  }

  return (
    <div aria-label="Active filters" {...stylex.props(styles.root)}>
      <LumenText className={stylex.props(styles.label).className} tone="tertiary" variant="caption">
        Filtered by
      </LumenText>
      {filters.map((filter) => (
        <LumenButton
          key={filter.id}
          aria-label={`Remove ${filter.label} filter`}
          className={stylex.props(styles.chip).className}
          size="small"
          variant="subtle"
          onPress={() => onRemove(filter)}
        >
          {filter.label}
          <XIcon aria-hidden="true" size={12} weight="bold" />
        </LumenButton>
      ))}
      {filters.length > 1 ? (
        <LumenButton
          className={stylex.props(styles.clear).className}
          size="small"
          variant="quiet"
          onPress={onClear}
        >
          Clear all
        </LumenButton>
      ) : null}
    </div>
  );
}
