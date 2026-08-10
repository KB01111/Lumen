import {useLayoutEffect, useRef, type RefObject} from 'react';
import {motion, useMotionValue, useSpring} from 'motion/react';

import {motionTokens} from '../../design-system/motion';
import {comfortableResultHeight} from './useResultVirtualizer';

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
  const hasPositioned = useRef(false);

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
        hasPositioned.current = false;
        return;
      }
      const measure = () => {
        if (!hasPositioned.current) {
          hasPositioned.current = true;
          springY.jump(selected.offsetTop);
        }
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
    const handlePreview = (event: Event) => updateSelection((event as CustomEvent<string | null>).detail);
    updateSelection(selectedId);
    window.addEventListener('lumen:selection-preview', handlePreview);
    return () => {
      observer?.disconnect();
      window.removeEventListener('lumen:selection-preview', handlePreview);
    };
  }, [containerRef, height, opacity, selectedId, springY, targetY]);

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-1.5 top-0 z-10 rounded-control border border-[color:var(--einui-command-divider)] bg-[var(--einui-command-row-selected)] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] high-contrast:shadow-none"
      data-selection-capsule="true"
      layoutId="lumen-result-selection"
      style={{height, opacity, y: reducedMotion ? targetY : springY}}
    />
  );
}
