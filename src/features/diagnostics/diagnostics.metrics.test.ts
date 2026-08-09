import {afterEach, describe, expect, it, vi} from 'vitest';

import {
  measureAfterPaint,
  readDiagnosticMetrics,
  resetDiagnosticMetrics,
  startDiagnosticsObserver,
} from './diagnostics.metrics';

afterEach(() => {
  resetDiagnosticMetrics();
  vi.unstubAllGlobals();
});

describe('measureAfterPaint', () => {
  it('does not emit a sample when its queued frame is cancelled', () => {
    let frame: FrameRequestCallback | undefined;
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);

    const cancel = measureAfterPaint('launcher-visible', 10);
    cancel();
    frame?.(26);

    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(readDiagnosticMetrics().timings).toHaveLength(0);
  });
});

describe('startDiagnosticsObserver', () => {
  it('ignores a queued long task that began before the most recent reset', () => {
    let callback: PerformanceObserverCallback = () => undefined;
    class FakePerformanceObserver {
      constructor(nextCallback: PerformanceObserverCallback) {
        callback = nextCallback;
      }

      disconnect() {}
      observe() {}
      takeRecords() { return []; }
    }
    vi.stubGlobal('PerformanceObserver', FakePerformanceObserver);
    vi.spyOn(performance, 'now').mockReturnValue(100);
    const stop = startDiagnosticsObserver();

    resetDiagnosticMetrics();
    const deliver = (duration: number, startTime: number) => callback({
      getEntries: () => [{duration, startTime}],
    } as unknown as PerformanceObserverEntryList, {} as PerformanceObserver);
    deliver(52, 99);
    deliver(20, 101);
    deliver(52, 101);

    expect(readDiagnosticMetrics().browserLongTasks).toEqual([52]);
    expect(readDiagnosticMetrics()).not.toHaveProperty('longTasks');
    stop();
  });
});
