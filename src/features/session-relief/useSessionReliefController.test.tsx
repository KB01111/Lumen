import {act, renderHook, waitFor} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {makeSessionReliefReport} from '../../services/session-relief/session-relief.fixture';
import type {SessionReliefService} from '../../services/session-relief/session-relief-service';
import {useSessionReliefController} from './useSessionReliefController';

function deferred<T>() {
  let resolve: (value: T) => void;
  let reject: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject; });
  return {promise, resolve: resolve!, reject: reject!};
}

describe('useSessionReliefController', () => {
  it('keeps only the newest collection result', async () => {
    const first = deferred<ReturnType<typeof makeSessionReliefReport>>();
    const second = deferred<ReturnType<typeof makeSessionReliefReport>>();
    const service: SessionReliefService = {collect: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)};
    const {result} = renderHook(() => useSessionReliefController(service));

    expect(result.current).toMatchObject({status: 'idle', report: null});
    act(() => { void result.current.analyze(); });
    expect(result.current.status).toBe('collecting');
    act(() => { void result.current.analyze(); });
    act(() => second.resolve(makeSessionReliefReport({capturedAt: 2_000, warnings: []})));
    await waitFor(() => expect(result.current.report?.capturedAt).toBe(2_000));
    act(() => first.resolve(makeSessionReliefReport({capturedAt: 1_000, warnings: []})));
    await waitFor(() => expect(result.current.report?.capturedAt).toBe(2_000));
  });

  it('marks warnings as partial and preserves an older report after a refresh failure', async () => {
    const report = makeSessionReliefReport();
    const service: SessionReliefService = {collect: vi.fn().mockResolvedValueOnce(report).mockRejectedValueOnce(new Error('raw error'))};
    const {result} = renderHook(() => useSessionReliefController(service));

    await act(async () => { await result.current.analyze(); });
    expect(result.current.status).toBe('partial');
    await act(async () => { await result.current.analyze(); });
    expect(result.current).toMatchObject({status: 'error', report});
    expect(result.current.error).toBe('Lumen could not complete the local session analysis.');
  });

  it('does not update state after unmount', async () => {
    const pending = deferred<ReturnType<typeof makeSessionReliefReport>>();
    const service: SessionReliefService = {collect: vi.fn(() => pending.promise)};
    const {result, unmount} = renderHook(() => useSessionReliefController(service));

    act(() => { void result.current.analyze(); });
    unmount();
    await act(async () => { pending.resolve(makeSessionReliefReport()); });
    expect(service.collect).toHaveBeenCalledOnce();
  });
});
