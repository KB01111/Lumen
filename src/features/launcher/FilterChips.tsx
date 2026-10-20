import {AnimatePresence, motion} from 'motion/react';

import {motionTokens} from '../../design-system/motion';
import {useLumenMotion} from '../../design-system/MotionProvider';
import {LumenUiIcon} from '../../design-system/icons/LumenUiIcon';
import {Button} from '@fluentui/react-components';
import type {SearchFilter} from '../../services/search/search.types';

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
          className="flex min-w-0 items-center gap-2 overflow-x-auto border-b border-[color:var(--einui-command-divider)] px-4 py-1.5 [scrollbar-width:none]"
          animate={{opacity: 1, y: 0}}
          exit={reducedMotion ? {opacity: 0} : {opacity: 0, y: -4}}
          initial={reducedMotion ? {opacity: 0} : {opacity: 0, y: -6}}
          transition={{duration}}
        >
          <span className="shrink-0 px-1 text-xs text-[color:var(--einui-command-muted-text)]">Filtered by</span>
          <AnimatePresence initial={false} mode="popLayout">
            {filters.map((filter) => (
              <motion.span
                key={filter.id}
                layout
                className="inline-flex shrink-0"
                animate={{opacity: 1, scale: 1}}
                exit={reducedMotion ? {opacity: 0} : {opacity: 0, scale: 0.94}}
                initial={reducedMotion ? {opacity: 0} : {opacity: 0, scale: 0.94}}
                transition={{duration}}
              >
                <Button data-launcher-control
                  aria-label={`Remove ${filter.label} filter`}
                  className="rounded-full"
                  size="small"
                  appearance="secondary"
                  onClick={() => onRemove(filter)}
                >
                  {filter.label}
                  <LumenUiIcon name="close" size="small" />
                </Button>
              </motion.span>
            ))}
          </AnimatePresence>
          {filters.length > 1 ? (
            <Button data-launcher-control
              className="ml-auto shrink-0"
              size="small"
              appearance="subtle"
              onClick={onClear}
            >
              Clear all
            </Button>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
