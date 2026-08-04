import {act, renderHook} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {MemoryAnswerService} from '../../services/answer/memory-answer-service';
import type {RuntimeMode} from '../../services/answer/answer.types';
import {useAnswerController} from './useAnswerController';

describe('useAnswerController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts every settled non-empty query after 350 ms', async () => {
    const service = new MemoryAnswerService();
    const {result} = renderHook(
      ({query}) => useAnswerController(service, {mode: 'auto', query}),
      {initialProps: {query: 'quarterly report'}},
    );

    await act(() => vi.advanceTimersByTimeAsync(349));
    expect(service.requests).toHaveLength(0);

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(service.requests).toHaveLength(1);
    expect(service.requests[0]?.request).toMatchObject({
      mode: 'auto',
      cloudConsent: false,
      query: 'quarterly report',
    });
    expect(result.current.phase).toBe('streaming');
  });

  it('restarts and forwards consent changes to the answer service', async () => {
    const service = new MemoryAnswerService();
    const {rerender} = renderHook(
      ({cloudConsent}) => useAnswerController(service, {
        cloudConsent,
        mode: 'cloud',
        query: 'private report',
      }),
      {initialProps: {cloudConsent: false}},
    );

    await act(() => vi.advanceTimersByTimeAsync(350));
    rerender({cloudConsent: true});
    await act(() => vi.advanceTimersByTimeAsync(350));

    expect(service.requests.map((item) => item.request.cloudConsent)).toEqual([false, true]);
  });

  it('cancels the old stream and restarts the same query when mode changes', async () => {
    const service = new MemoryAnswerService();
    const {rerender} = renderHook(
      ({mode}) => useAnswerController(service, {mode, query: 'explain this'}),
      {initialProps: {mode: 'cloud' as RuntimeMode}},
    );

    await act(() => vi.advanceTimersByTimeAsync(350));
    const firstSignal = service.requests[0]?.signal;
    rerender({mode: 'local'});

    expect(firstSignal?.aborted).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(350));
    expect(service.requests.map((item) => item.request.mode)).toEqual(['cloud', 'local']);
  });

  it('keeps citations and usage from the current stream only', async () => {
    const service = new MemoryAnswerService();
    const {result, rerender} = renderHook(
      ({query}) => useAnswerController(service, {mode: 'auto', query}),
      {initialProps: {query: 'first'}},
    );

    await act(() => vi.advanceTimersByTimeAsync(350));
    rerender({query: 'second'});
    await act(() => vi.advanceTimersByTimeAsync(350));

    await act(() => service.emit('first', {type: 'delta', text: 'stale'}));
    await act(() => service.emit('second', {
      type: 'citation',
      citation: {fileId: 'report', label: 'Report.pdf', page: 4},
    }));
    await act(() => service.emit('second', {type: 'delta', text: 'Current answer'}));
    await act(() => service.emit('second', {
      type: 'usage',
      usage: {inputTokens: 120, outputTokens: 20, remainingTokens: 860},
    }));
    await act(() => service.emit('second', {
      type: 'completed',
      model: 'gpt-5.4-mini',
      provider: 'openai',
      route: 'lumen.answer.cloud',
    }));

    expect(result.current.text).toBe('Current answer');
    expect(result.current.citations).toEqual([
      {fileId: 'report', label: 'Report.pdf', page: 4},
    ]);
    expect(result.current.usage?.remainingTokens).toBe(860);
    expect(result.current.phase).toBe('completed');
  });

  it('stops immediately and can retry the same query', async () => {
    const service = new MemoryAnswerService();
    const {result} = renderHook(() =>
      useAnswerController(service, {mode: 'auto', query: 'retry me'}),
    );

    await act(() => vi.advanceTimersByTimeAsync(350));
    const firstSignal = service.requests[0]?.signal;
    act(() => result.current.stop());

    expect(firstSignal?.aborted).toBe(true);
    expect(result.current.phase).toBe('cancelled');

    act(() => result.current.retry());
    await act(() => vi.advanceTimersByTimeAsync(350));
    expect(service.requests).toHaveLength(2);
  });
});
