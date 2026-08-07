import {StrictMode} from 'react';
import {act, renderHook, waitFor} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import type {WindowMode, WindowService} from '../../platform/window/window-service';
import {useLauncherStore} from './launcher.store';
import {useLauncherPresentation} from './useLauncherPresentation';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {promise, reject, resolve};
}

class DeferredWindowService implements WindowService {
  readonly calls: WindowMode[] = [];
  private readonly deferredShows: Array<{
    mode: WindowMode;
    operation: ReturnType<typeof deferred<void>>;
  }> = [];

  show(mode: WindowMode) {
    this.calls.push(mode);
    const operation = deferred<void>();
    this.deferredShows.push({mode, operation});
    return operation.promise;
  }

  resolveShow(mode: WindowMode, occurrence = 0) {
    this.deferredShows.filter((entry) => entry.mode === mode)[occurrence]?.operation.resolve();
  }

  rejectShow(mode: WindowMode, error: Error, occurrence = 0) {
    this.deferredShows.filter((entry) => entry.mode === mode)[occurrence]?.operation.reject(error);
  }

  async hide() {}
  async focusInput() {}
  async setShortcut() {}
}

afterEach(() => {
  vi.useRealTimers();
  useLauncherStore.getState().reset();
});

describe('useLauncherPresentation', () => {
  it('waits for native expanded bounds before showing the workspace', async () => {
    const windowService = new DeferredWindowService();
    const {result, rerender} = renderHook(
      ({hasContent}) => useLauncherPresentation({hasContent, reducedMotion: false, windowService}),
      {initialProps: {hasContent: false}},
    );

    expect(result.current.expanded).toBe(false);

    rerender({hasContent: true});
    expect(windowService.calls).toEqual(['expanded']);
    expect(result.current.expanded).toBe(false);

    await act(async () => {
      windowService.resolveShow('expanded');
      await Promise.resolve();
    });

    expect(result.current.expanded).toBe(true);
    expect(useLauncherStore.getState().mode).toBe('expanded');
  });

  it('reconciles native expansion after the development strict-mode remount', async () => {
    const windowService = new DeferredWindowService();
    const {result, rerender} = renderHook(
      ({hasContent}) => useLauncherPresentation({hasContent, reducedMotion: false, windowService}),
      {initialProps: {hasContent: false}, wrapper: StrictMode},
    );

    rerender({hasContent: true});
    expect(windowService.calls).toEqual(['expanded']);
    await act(async () => {
      windowService.resolveShow('expanded');
      await Promise.resolve();
    });

    expect(result.current.expanded).toBe(true);
  });

  it('hands an unresolved native expansion to a new collapsed hook instance', async () => {
    const windowService = new DeferredWindowService();
    const first = renderHook(
      ({hasContent}) => useLauncherPresentation({hasContent, reducedMotion: false, windowService}),
      {initialProps: {hasContent: false}},
    );

    first.rerender({hasContent: true});
    expect(windowService.calls).toEqual(['expanded']);
    first.unmount();

    const second = renderHook(
      () => useLauncherPresentation({hasContent: false, reducedMotion: false, windowService}),
    );
    await act(async () => {
      windowService.resolveShow('expanded');
      await Promise.resolve();
    });
    expect(windowService.calls).toEqual(['expanded', 'collapsed']);

    await act(async () => {
      windowService.resolveShow('collapsed');
      await Promise.resolve();
    });
    expect(second.result.current.expanded).toBe(false);
    expect(useLauncherStore.getState().mode).toBe('collapsed');
  });

  it('reconciles an unresolved strict-mode expansion after remount changes intent to collapsed', async () => {
    const windowService = new DeferredWindowService();
    const {result, rerender} = renderHook(
      ({hasContent}) => useLauncherPresentation({hasContent, reducedMotion: false, windowService}),
      {initialProps: {hasContent: true}, wrapper: StrictMode},
    );

    expect(windowService.calls).toEqual(['expanded']);
    rerender({hasContent: false});
    await act(async () => {
      windowService.resolveShow('expanded');
      await Promise.resolve();
    });
    expect(windowService.calls).toEqual(['expanded', 'collapsed']);

    await act(async () => {
      windowService.resolveShow('collapsed');
      await Promise.resolve();
    });
    expect(result.current.expanded).toBe(false);
    expect(useLauncherStore.getState().mode).toBe('collapsed');
  });

  it('hides the workspace before requesting collapsed native bounds', async () => {
    vi.useFakeTimers();
    const windowService = new DeferredWindowService();
    const {result, rerender} = renderHook(
      ({hasContent}) => useLauncherPresentation({hasContent, reducedMotion: false, windowService}),
      {initialProps: {hasContent: true}},
    );

    await act(async () => {
      windowService.resolveShow('expanded');
      await Promise.resolve();
    });
    expect(result.current.expanded).toBe(true);

    rerender({hasContent: false});
    expect(result.current.expanded).toBe(false);
    expect(windowService.calls).toEqual(['expanded']);

    await act(async () => vi.advanceTimersByTimeAsync(119));
    expect(windowService.calls).toEqual(['expanded']);

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(windowService.calls).toEqual(['expanded', 'collapsed']);
    expect(useLauncherStore.getState().mode).toBe('collapsed');
  });

  it('uses no close delay when reduced motion is enabled', async () => {
    vi.useFakeTimers();
    const windowService = new DeferredWindowService();
    const {result, rerender} = renderHook(
      ({hasContent}) => useLauncherPresentation({hasContent, reducedMotion: true, windowService}),
      {initialProps: {hasContent: true}},
    );

    await act(async () => {
      windowService.resolveShow('expanded');
      await Promise.resolve();
    });
    expect(result.current.expanded).toBe(true);

    rerender({hasContent: false});
    await act(async () => vi.advanceTimersByTimeAsync(0));

    expect(result.current.expanded).toBe(false);
    expect(windowService.calls).toEqual(['expanded', 'collapsed']);
  });

  it('does not allow a stale collapse timer to shrink a newly expanded launcher', async () => {
    vi.useFakeTimers();
    const windowService = new DeferredWindowService();
    const {result, rerender} = renderHook(
      ({hasContent}) => useLauncherPresentation({hasContent, reducedMotion: false, windowService}),
      {initialProps: {hasContent: true}},
    );

    await act(async () => {
      windowService.resolveShow('expanded');
      await Promise.resolve();
    });
    expect(result.current.expanded).toBe(true);

    rerender({hasContent: false});
    rerender({hasContent: true});
    await act(async () => {
      windowService.resolveShow('expanded', 1);
      await Promise.resolve();
    });
    await act(async () => vi.advanceTimersByTimeAsync(120));

    expect(result.current.expanded).toBe(true);
    expect(windowService.calls).toEqual(['expanded']);
  });

  it('reconciles a clear that arrives while native expansion is pending back to collapsed bounds', async () => {
    const windowService = new DeferredWindowService();
    const {result, rerender} = renderHook(
      ({hasContent}) => useLauncherPresentation({hasContent, reducedMotion: false, windowService}),
      {initialProps: {hasContent: false}},
    );

    rerender({hasContent: true});
    rerender({hasContent: false});
    expect(result.current.expanded).toBe(false);
    expect(windowService.calls).toEqual(['expanded']);

    await act(async () => {
      windowService.resolveShow('expanded');
      await Promise.resolve();
    });
    expect(windowService.calls).toEqual(['expanded', 'collapsed']);

    await act(async () => {
      windowService.resolveShow('collapsed');
      await Promise.resolve();
    });
    expect(useLauncherStore.getState().mode).toBe('collapsed');
    expect(result.current.expanded).toBe(false);
  });

  it('serializes collapse followed by expansion so the final native mode is expanded', async () => {
    vi.useFakeTimers();
    const windowService = new DeferredWindowService();
    const {result, rerender} = renderHook(
      ({hasContent}) => useLauncherPresentation({hasContent, reducedMotion: false, windowService}),
      {initialProps: {hasContent: true}},
    );

    await act(async () => {
      windowService.resolveShow('expanded');
      await Promise.resolve();
    });
    rerender({hasContent: false});
    await act(async () => vi.advanceTimersByTimeAsync(120));
    rerender({hasContent: true});
    expect(windowService.calls).toEqual(['expanded', 'collapsed']);

    await act(async () => {
      windowService.resolveShow('collapsed');
      await Promise.resolve();
    });
    expect(windowService.calls).toEqual(['expanded', 'collapsed', 'expanded']);

    await act(async () => {
      windowService.resolveShow('expanded', 1);
      await Promise.resolve();
    });
    expect(result.current.expanded).toBe(true);
    expect(useLauncherStore.getState().mode).toBe('expanded');
  });

  it('restores a visible expanded workspace when native collapse is rejected', async () => {
    vi.useFakeTimers();
    const windowService = new DeferredWindowService();
    const {result, rerender} = renderHook(
      ({hasContent}) => useLauncherPresentation({hasContent, reducedMotion: false, windowService}),
      {initialProps: {hasContent: true}},
    );

    await act(async () => {
      windowService.resolveShow('expanded');
      await Promise.resolve();
    });
    rerender({hasContent: false});
    await act(async () => vi.advanceTimersByTimeAsync(120));
    act(() => windowService.rejectShow('collapsed', new Error('Native collapse unavailable')));

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.presentationError).toBe('Native collapse unavailable');
    expect(result.current.expanded).toBe(true);
    expect(useLauncherStore.getState().mode).toBe('expanded');
  });

  it('reports failed native presentation without retaining an expanded workspace', async () => {
    const windowService = new DeferredWindowService();
    const {result, rerender} = renderHook(
      ({hasContent}) => useLauncherPresentation({hasContent, reducedMotion: false, windowService}),
      {initialProps: {hasContent: false}},
    );

    rerender({hasContent: true});
    act(() => windowService.rejectShow('expanded', new Error('Native resize unavailable')));

    await waitFor(() => expect(result.current.presentationError).toBe('Native resize unavailable'));
    expect(result.current.expanded).toBe(false);
    expect(useLauncherStore.getState().mode).toBe('collapsed');
  });
});
