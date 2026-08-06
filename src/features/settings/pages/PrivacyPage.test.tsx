import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {AppProviders} from '../../../app/AppProviders';
import {nativeAiService} from '../../../services/ai/native-ai-service';
import {searchHistoryPersistence, useSearchHistoryStore} from '../../launcher/search-history.store';
import {useSettingsStore} from '../settings.store';
import {PrivacyPage} from './PrivacyPage';

function renderPage(searchService?: {invalidateIndex?(): void}) {
  return render(
    <AppProviders>
      <PrivacyPage searchService={searchService} />
    </AppProviders>,
  );
}

function enableNativeRuntime() {
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    configurable: true,
    value: {},
  });
}

afterEach(() => {
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  useSettingsStore.getState().reset();
  useSearchHistoryStore.getState().reset();
  localStorage.clear();
});

describe('PrivacyPage local index deletion', () => {
  it('clears the actual local history only after its store commits', async () => {
    const user = userEvent.setup();
    useSearchHistoryStore.setState({entries: [{query: 'budget', openedAt: 1}], hydrated: true});
    renderPage();

    await user.click(screen.getByRole('button', {name: 'Clear search history'}));
    await user.click(screen.getByRole('button', {name: 'Clear 1 history entries'}));

    expect(await screen.findByText('Local search history cleared.')).toBeVisible();
    expect(useSearchHistoryStore.getState().entries).toEqual([]);
  });

  it('retains displayed history when clearing the persistence boundary fails', async () => {
    const user = userEvent.setup();
    useSearchHistoryStore.setState({entries: [{query: 'budget', openedAt: 1}], hydrated: true});
    vi.spyOn(searchHistoryPersistence, 'clear').mockRejectedValue(new Error('store locked'));
    renderPage();

    await user.click(screen.getByRole('button', {name: 'Clear search history'}));
    await user.click(screen.getByRole('button', {name: 'Clear 1 history entries'}));

    expect(await screen.findByRole('alert')).toHaveTextContent('The local search history could not be cleared. Existing history was kept.');
    expect(useSearchHistoryStore.getState().entries).toHaveLength(1);
  });

  it('keeps index deletion explicitly unavailable in the browser', async () => {
    const user = userEvent.setup();
    const deleteIndex = vi.spyOn(nativeAiService, 'deleteIndex');

    renderPage();

    expect(screen.getByText('Index deletion requires the native Windows app and is unavailable in the browser.')).toBeVisible();
    expect(screen.getByText('Unavailable')).toBeVisible();
    const button = screen.getByRole('button', {name: 'Delete index'});
    expect(button).toBeDisabled();

    await user.click(button);
    expect(deleteIndex).not.toHaveBeenCalled();
  });

  it('deletes native index data before invalidating the active search cache', async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    enableNativeRuntime();
    vi.spyOn(nativeAiService, 'deleteIndex').mockImplementation(async () => {
      calls.push('delete');
      return {
        phase: 'ready',
        indexedItems: 0,
        queuedEnrichment: 0,
        skippedItems: 0,
        message: 'Local index data deleted; source files were not changed',
      };
    });
    const invalidateIndex = vi.fn(() => calls.push('invalidate'));
    renderPage({invalidateIndex});

    await user.click(screen.getByRole('button', {name: 'Delete index'}));
    await user.click(screen.getByRole('button', {name: 'Delete local index data'}));

    expect(await screen.findByText('Local index data deleted; source files were not changed')).toBeVisible();
    expect(calls).toEqual(['delete', 'invalidate']);
    expect(invalidateIndex).toHaveBeenCalledOnce();
  });

  it('does not invalidate the search cache when native deletion fails', async () => {
    const user = userEvent.setup();
    enableNativeRuntime();
    vi.spyOn(nativeAiService, 'deleteIndex').mockRejectedValue(new Error('index store locked'));
    const invalidateIndex = vi.fn();
    renderPage({invalidateIndex});

    await user.click(screen.getByRole('button', {name: 'Delete index'}));
    await user.click(screen.getByRole('button', {name: 'Delete local index data'}));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The local index could not be deleted: index store locked',
    );
    expect(invalidateIndex).not.toHaveBeenCalled();
  });

  it('reports a cache refresh failure without claiming native deletion failed', async () => {
    const user = userEvent.setup();
    enableNativeRuntime();
    vi.spyOn(nativeAiService, 'deleteIndex').mockResolvedValue({
      phase: 'ready',
      indexedItems: 0,
      queuedEnrichment: 0,
      skippedItems: 0,
      message: 'Local index data deleted',
    });
    renderPage({
      invalidateIndex: () => {
        throw new Error('cache unavailable');
      },
    });

    await user.click(screen.getByRole('button', {name: 'Delete index'}));
    await user.click(screen.getByRole('button', {name: 'Delete local index data'}));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The local index was deleted, but the active search cache could not be refreshed: cache unavailable',
    );
  });
});
