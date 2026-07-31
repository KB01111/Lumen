import {useLayoutEffect, type RefObject} from 'react';

import * as stylex from '@stylexjs/stylex';
import {motion, useMotionValue, useSpring} from 'motion/react';

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
  const targetY = useMotionValue(0);
  const springY = useSpring(targetY, motionTokens.selectionSpring);
  const height = useMotionValue(comfortableResultHeight);
  const opacity = useMotionValue(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    let observer: ResizeObserver | undefined;
    const updateSelection = (fileId: string | null) => {
      observer?.disconnect();
      observer = undefined;
      const selected = fileId
        ? [...(container?.querySelectorAll<HTMLElement>('[data-result-id]') ?? [])]
            .find((element) => element.dataset.resultId === fileId)
        : null;
      if (!container || !selected) {
        opacity.set(0);
        return;
      }

      const measure = () => {
        targetY.set(selected.offsetTop);
        height.set(selected.offsetHeight || comfortableResultHeight);
        opacity.set(1);
      };
      measure();
      if (typeof ResizeObserver === 'function') {
        observer = new ResizeObserver(measure);
        observer.observe(selected);
      }
    };
    const handlePreview = (event: Event) => {
      updateSelection((event as CustomEvent<string | null>).detail);
    };
    updateSelection(selectedId);
    window.addEventListener('lumen:selection-preview', handlePreview);
    return () => {
      observer?.disconnect();
      window.removeEventListener('lumen:selection-preview', handlePreview);
    };
  }, [containerRef, height, opacity, selectedId, targetY]);

  return (
    <motion.div
      aria-hidden="true"
      {...stylex.props(styles.capsule)}
      data-selection-capsule="true"
      layoutId="lumen-result-selection"
      style={{
        height,
        opacity,
        y: reducedMotion ? targetY : springY,
      }}
    />
  );
}
