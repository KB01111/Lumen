import {createRef} from 'react';
import {renderHook} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {compactResultHeight, useResultVirtualizer} from './useResultVirtualizer';

describe('useResultVirtualizer', () => {
  it('uses the compact row height for the full virtual canvas', () => {
    const scrollRef = createRef<HTMLDivElement>();
    const {result} = renderHook(() => useResultVirtualizer(
      10_000,
      scrollRef,
      (index) => String(index),
      400,
      compactResultHeight,
    ));

    expect(result.current.totalSize).toBe(460_000);
  });
});
