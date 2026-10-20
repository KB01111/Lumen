import {act, fireEvent, render, screen} from '@testing-library/react';
import {Profiler} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {SearchInput} from './SearchInput';
import {useQueryStore} from './query.store';

afterEach(() => {
  useQueryStore.getState().reset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('SearchInput composition admission', () => {
  it('keeps rapid native input outside React commits and publishes the latest draft after paint', () => {
    vi.useFakeTimers();
    let pending: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { pending = callback; return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => { pending = undefined; });
    const onRender = vi.fn();
    render(<Profiler id="input" onRender={onRender}><SearchInput onEscapeEmpty={() => undefined} /></Profiler>);
    const input = screen.getByRole('searchbox') as HTMLInputElement;
    const initialCommits = onRender.mock.calls.length;

    for (let index = 1; index <= 30; index += 1) {
      fireEvent.input(input, {target: {value: `rapid-${index}`}});
    }
    input.setSelectionRange(3, 3);
    expect(input).toHaveValue('rapid-30');
    expect(onRender).toHaveBeenCalledTimes(initialCommits);
    expect(useQueryStore.getState().draft).toBe('');
    act(() => { pending?.(16); vi.runOnlyPendingTimers(); });
    expect(useQueryStore.getState().draft).toBe('rapid-30');
    expect(input.selectionStart).toBe(3);
    expect(input.selectionEnd).toBe(3);
  });

  it('keeps the same input through external draft changes and returns focus after clearing', () => {
    useQueryStore.getState().setDraft('report');
    render(<SearchInput onEscapeEmpty={() => undefined} />);
    const input = screen.getByRole('searchbox');
    act(() => useQueryStore.getState().clear());
    expect(input).toHaveValue('');
    act(() => useQueryStore.getState().setDraft('design'));
    expect(input).toHaveValue('design');
    fireEvent.click(screen.getByRole('button', {name: 'Clear search'}));
    expect(screen.getByRole('searchbox')).toBe(input);
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });
  for (const boundary of ['before frame', 'after frame before timer']) {
    it(`publishes preceding ordinary input when composition starts ${boundary}`, () => {
      vi.useFakeTimers();
      const frames = new Map<number, FrameRequestCallback>();
      let nextFrame = 0;
      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        const id = ++nextFrame;
        frames.set(id, callback);
        return id;
      });
      vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
      const flushInputWork = () => act(() => {
        const pending = [...frames.values()];
        frames.clear();
        pending.forEach((frame) => frame(16));
        vi.runOnlyPendingTimers();
      });
      render(<SearchInput onEscapeEmpty={() => undefined} />);
      const input = screen.getByRole('searchbox') as HTMLInputElement;

      fireEvent.input(input, {target: {value: 'report'}});
      flushInputWork();
      fireEvent.input(input, {target: {value: ''}});
      flushInputWork();
      expect(useQueryStore.getState().committed).toBe('');
      fireEvent.input(input, {target: {value: 'report again'}});
      input.setSelectionRange(3, 3);
      if (boundary.startsWith('after')) act(() => {
        frames.get(nextFrame)!(16);
        frames.clear();
      });
      fireEvent.compositionStart(input);
      flushInputWork();

      expect(screen.getByRole('searchbox')).toBe(input);
      expect(input).toHaveValue('report again');
      expect(input.selectionStart).toBe(3);
      expect(input.selectionEnd).toBe(3);
      expect(useQueryStore.getState()).toMatchObject({
        committed: 'report again', draft: 'report again', isComposing: true,
      });

      fireEvent.input(input, {target: {value: 'report again\u30eb'}});
      flushInputWork();
      expect(useQueryStore.getState()).toMatchObject({
        committed: 'report again', draft: 'report again\u30eb', isComposing: true,
      });
      fireEvent.compositionEnd(input);
      expect(useQueryStore.getState()).toMatchObject({
        committed: 'report again\u30eb', isComposing: false,
      });
      expect(screen.getByRole('searchbox')).toBe(input);
    });
  }
});
