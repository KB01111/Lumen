import {afterEach, describe, expect, it, vi} from 'vitest';

import {useLauncherStore} from './launcher.store';
import {usePreviewStore} from './preview.store';
import {useQueryStore} from './query.store';
import {useScopeStore} from './scope.store';
import {useSelectionStore} from './selection.store';

afterEach(() => {
  useLauncherStore.getState().reset();
  usePreviewStore.getState().reset();
  useQueryStore.getState().reset();
  useScopeStore.getState().reset();
  useSelectionStore.getState().reset();
});

describe('focused launcher stores', () => {
  it('does not publish query changes while IME composition is active', () => {
    useQueryStore.getState().startComposition();
    useQueryStore.getState().setDraft('ルーメン');

    expect(useQueryStore.getState().committed).toBe('');
    useQueryStore.getState().endComposition();
    expect(useQueryStore.getState().committed).toBe('ルーメン');
  });

  it('keeps draft, selection, focus region, and preview lifecycle independent', () => {
    useQueryStore.getState().setDraft('report');
    useSelectionStore.getState().select('file-7');
    useSelectionStore.getState().focusRegion('results');
    usePreviewStore.getState().request('file-7', 'pane');

    expect(useQueryStore.getState()).toMatchObject({draft: 'report', committed: 'report'});
    expect(useSelectionStore.getState()).toMatchObject({
      selectedId: 'file-7',
      focusedRegion: 'results',
    });
    expect(usePreviewStore.getState()).toMatchObject({
      fileId: 'file-7',
      mode: 'pane',
      status: 'loading',
    });
  });

  it('updates scopes and filters without mutating prior filter collections', () => {
    const before = useScopeStore.getState().activeFilters;
    useScopeStore.getState().setScope('documents');
    useScopeStore.getState().toggleFilter({
      id: 'modified',
      label: 'Modified today',
      value: 'today',
    });

    expect(before).toEqual([]);
    expect(useScopeStore.getState()).toMatchObject({
      activeScope: 'documents',
      activeFilters: [{id: 'modified', label: 'Modified today', value: 'today'}],
    });
  });

  it('does not notify an unrelated preview selector for query edits', () => {
    const listener = vi.fn();
    const unsubscribe = usePreviewStore.subscribe((state) => state.status, listener);

    useQueryStore.getState().setDraft('independent');

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('tracks the controlled native mode without conflating visibility', () => {
    useLauncherStore.getState().show('expanded');
    useLauncherStore.getState().hide();

    expect(useLauncherStore.getState()).toMatchObject({
      mode: 'expanded',
      visible: false,
    });
  });
});

