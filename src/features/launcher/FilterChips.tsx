import * as stylex from '@stylexjs/stylex';
import {AnimatePresence, motion} from 'motion/react';

import {motionTokens} from '../../design-system/motion';
import {useLumenMotion} from '../../design-system/MotionProvider';
import {LumenUiIcon} from '../../design-system/icons/LumenUiIcon';
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
    display: 'inline-flex',
  },
  chipButton: {
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
  const {reducedMotion} = useLumenMotion();
  const duration = motionTokens.duration.selection;

  return (
    <AnimatePresence initial={false}>
      {filters.length > 0 ? (
        <motion.div
          key="active-filters"
          aria-label="Active filters"
          {...stylex.props(styles.root)}
          animate={{opacity: 1, y: 0}}
          exit={reducedMotion ? {opacity: 0} : {opacity: 0, y: -4}}
          initial={reducedMotion ? {opacity: 0} : {opacity: 0, y: -6}}
          transition={{duration}}
        >
          <LumenText className={stylex.props(styles.label).className} tone="tertiary" variant="caption">
            Filtered by
          </LumenText>
          <AnimatePresence initial={false} mode="popLayout">
            {filters.map((filter) => (
              <motion.span
                key={filter.id}
                layout
                {...stylex.props(styles.chip)}
                animate={{opacity: 1, scale: 1}}
                exit={reducedMotion ? {opacity: 0} : {opacity: 0, scale: 0.94}}
                initial={reducedMotion ? {opacity: 0} : {opacity: 0, scale: 0.94}}
                transition={{duration}}
              >
                <LumenButton
                  aria-label={`Remove ${filter.label} filter`}
                  className={stylex.props(styles.chipButton).className}
                  size="small"
                  variant="subtle"
                  onPress={() => onRemove(filter)}
                >
                  {filter.label}
                  <LumenUiIcon name="close" size="small" />
                </LumenButton>
              </motion.span>
            ))}
          </AnimatePresence>
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
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
