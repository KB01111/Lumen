import {useLayoutEffect, useState, type RefObject} from 'react';

import * as stylex from '@stylexjs/stylex';
import {motion} from 'motion/react';

import {motionTokens} from '../../design-system/motion';
import {tokens} from '../../design-system/tokens.stylex';
import {comfortableResultHeight} from './useResultVirtualizer';

const styles = stylex.create({
  capsule: {
    position: 'absolute',
    top: 0,
    left: tokens.space2,
    right: tokens.space2,
    zIndex: tokens.zSelection,
    pointerEvents: 'none',
    backgroundColor: tokens.colorSelectionStrong,
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusMedium,
    boxShadow: tokens.shadowInsetTop,
  },
});

export interface SelectionCapsuleProps {
  containerRef: RefObject<HTMLDivElement | null>;
  reducedMotion?: boolean;
  selectedId: string | null;
}

export function SelectionCapsule({
  containerRef,
  reducedMotion = false,
  selectedId,
}: SelectionCapsuleProps) {
  const [geometry, setGeometry] = useState({y: 0, height: comfortableResultHeight, visible: false});

  useLayoutEffect(() => {
    const container = containerRef.current;
    const selected = selectedId
      ? [...(container?.querySelectorAll<HTMLElement>('[data-result-id]') ?? [])]
          .find((element) => element.dataset.resultId === selectedId)
      : null;
    if (!container || !selected) {
      setGeometry((current) => ({...current, visible: false}));
      return;
    }

    const measure = () => {
      setGeometry({
        y: selected.offsetTop,
        height: selected.offsetHeight || comfortableResultHeight,
        visible: true,
      });
    };
    measure();

    if (typeof ResizeObserver !== 'function') {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(selected);
    return () => observer.disconnect();
  }, [containerRef, selectedId]);

  return (
    <motion.div
      aria-hidden="true"
      {...stylex.props(styles.capsule)}
      animate={{
        height: geometry.height,
        opacity: geometry.visible ? 1 : 0,
        y: geometry.y,
      }}
      data-selection-capsule="true"
      layoutId="lumen-result-selection"
      transition={reducedMotion ? {duration: 0} : motionTokens.selectionSpring}
    />
  );
}
