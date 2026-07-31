import type {RefObject} from 'react';

import {useVirtualizer} from '@tanstack/react-virtual';

export const resultVirtualizationThreshold = 120;
export const comfortableResultHeight = 58;

export function useResultVirtualizer(
  count: number,
  scrollRef: RefObject<HTMLDivElement | null>,
  getItemKey: (index: number) => string,
  viewportHeight: number,
) {
  const virtualizer = useVirtualizer({
    count,
    enabled: count > resultVirtualizationThreshold,
    estimateSize: () => comfortableResultHeight,
    getScrollElement: () => scrollRef.current,
    getItemKey,
    initialRect: {width: 800, height: viewportHeight},
    observeElementRect: (instance, callback) => {
      const element = instance.scrollElement;
      if (!element) {
        return;
      }

      const measure = () => {
        const rect = element.getBoundingClientRect();
        callback({
          width: Math.round(rect.width || 800),
          height: Math.round(rect.height || viewportHeight),
        });
      };
      measure();

      if (typeof ResizeObserver !== 'function') {
        return () => undefined;
      }
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    },
    overscan: 5,
    useFlushSync: false,
  });

  return {
    isVirtualized: count > resultVirtualizationThreshold,
    totalSize: virtualizer.getTotalSize(),
    virtualItems: virtualizer.getVirtualItems(),
  };
}
