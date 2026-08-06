import {act, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {BrowserWindowService} from '../../platform/window/browser-window-service';
import {MemorySearchService} from '../../services/search/memory-search-service';
import type {SearchResult} from '../../services/search/search.types';
import {SearchExperience} from '../launcher/SearchExperience';
import {useLauncherStore} from '../launcher/launcher.store';
import {usePreviewStore} from '../launcher/preview.store';
import {useQueryStore} from '../launcher/query.store';
import {useSearchHistoryStore} from '../launcher/search-history.store';
import {useScopeStore} from '../launcher/scope.store';
import {useSelectionStore} from '../launcher/selection.store';
import {useSettingsStore} from '../settings/settings.store';

function file(id: string): SearchResult {
  return {
    id,
    name: `${id}.tsx`,
    path: `C:\\Projects\\Lumen\\${id}.tsx`,
    kind: 'source',
    match: {source: 'filename', fragment: id},
    metadata: {extension: 'tsx', sizeBytes: 2048},
    availability: 'available',
  };
}

async function searchFor(
  service: MemorySearchService,
  user: ReturnType<typeof userEvent.setup>,
  query: string,
  results: readonly SearchResult[],
) {
  await user.type(screen.getByRole('searchbox', {name: 'Search files'}), query);
  await waitFor(() => expect(
    service.requests.some(({request}) => request.query === query),
  ).toBe(true));
  await act(() => service.resolve(query, results));
  await screen.findByRole('row', {name: new RegExp(results[0]?.name ?? '')});
}

afterEach(() => {
  useLauncherStore.getState().reset();
  usePreviewStore.getState().reset();
  useQueryStore.getState().reset();
  useSearchHistoryStore.getState().reset();
  useScopeStore.getState().reset();
  useSelectionStore.getState().reset();
  useSettingsStore.getState().reset();
  localStorage.clear();
});

describe('Lumen keyboard coordination', () => {
  it('opens the selected file and hides after tactile confirmation', async () => {
    const user = userEvent.setup();
    const service = new MemorySearchService();
    const windowService = new BrowserWindowService();
    render(<SearchExperience service={service} windowService={windowService} />);

    await searchFor(service, user, 'alpha', [file('alpha'), file('beta')]);
    await user.keyboard('{Enter}');

    await waitFor(() => expect(service.openedFiles).toEqual(['alpha']));
    await waitFor(() => expect(windowService.snapshot().visible).toBe(false));
    await waitFor(() => expect(useSearchHistoryStore.getState().entries.map((entry) => entry.query)).toEqual(['alpha']));
  });

  it('recalls successful open queries with arrows only for file search', async () => {
    const user = userEvent.setup();
    useSearchHistoryStore.setState({
      entries: [{query: 'latest query', openedAt: 2}, {query: 'older query', openedAt: 1}],
      hydrated: true,
    });
    const service = new MemorySearchService();
    render(<SearchExperience service={service} windowService={new BrowserWindowService()} />);
    const input = screen.getByRole('searchbox', {name: 'Search files'});

    await user.keyboard('{ArrowUp}');
    expect(input).toHaveValue('latest query');
    await user.keyboard('{ArrowUp}');
    expect(input).toHaveValue('older query');
    await user.keyboard('{ArrowDown}');
    expect(input).toHaveValue('latest query');

    useSettingsStore.setState((state) => ({general: {...state.general, historyEnabled: false}}));
    useQueryStore.getState().clear();
    await user.keyboard('{ArrowUp}');
    expect(input).toHaveValue('');

    useSettingsStore.setState((state) => ({general: {...state.general, historyEnabled: true}}));
    useLauncherStore.setState({intent: 'computer'});
    expect(await screen.findByRole('searchbox', {name: 'Describe a browser task'})).toBeVisible();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('searchbox', {name: 'Describe a browser task'})).toHaveValue('');
  });

  it('keeps ArrowDown result navigation until history recall starts with ArrowUp', async () => {
    const user = userEvent.setup();
    useSearchHistoryStore.setState({entries: [{query: 'older query', openedAt: 1}], hydrated: true});
    const service = new MemorySearchService();
    render(<SearchExperience service={service} windowService={new BrowserWindowService()} />);

    await searchFor(service, user, 'code', [file('alpha'), file('beta')]);
    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('searchbox', {name: 'Search files'})).toHaveValue('code');
    expect(screen.getByRole('row', {name: /beta\.tsx/i})).toHaveAttribute('data-selected', 'true');
  });

  it('moves stable selection with arrows and announces its context', async () => {
    const user = userEvent.setup();
    const service = new MemorySearchService();
    render(<SearchExperience service={service} windowService={new BrowserWindowService()} />);

    await searchFor(service, user, 'code', [file('alpha'), file('beta')]);
    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('row', {name: /beta\.tsx/i})).toHaveAttribute(
      'data-selected',
      'true',
    );
    expect(screen.getByTestId('search-announcement')).toHaveTextContent(
      /2 results.*beta\.tsx/i,
    );
  });

  it('opens the containing folder and the narrow details dialog from shortcuts', async () => {
    const user = userEvent.setup();
    const service = new MemorySearchService();
    render(<SearchExperience service={service} windowService={new BrowserWindowService()} />);

    await searchFor(service, user, 'alpha', [file('alpha')]);
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(service.openedFolders).toEqual(['alpha']);

    await user.keyboard('{Alt>}{Enter}{/Alt}');
    expect(await screen.findByRole('dialog', {name: 'File details'})).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', {name: 'File details'})).toBeNull();
    expect(screen.getByRole('searchbox', {name: 'Search files'})).toHaveFocus();
  });

  it('moves between keyboard regions and exposes global focus and settings shortcuts', async () => {
    const user = userEvent.setup();
    const service = new MemorySearchService();
    const windowService = new BrowserWindowService();
    const onOpenSettings = vi.fn();
    render(
      <SearchExperience
        service={service}
        windowService={windowService}
        onOpenSettings={onOpenSettings}
      />,
    );

    await searchFor(service, user, 'alpha', [file('alpha')]);
    await user.keyboard('{Tab}');
    expect(screen.getByRole('tab', {name: 'All'})).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(useScopeStore.getState().activeScope).toBe('files');

    await user.keyboard('{Control>}k{/Control}');
    expect(screen.getByRole('searchbox', {name: 'Search files'})).toHaveFocus();

    await user.keyboard('{Control>},{/Control}');
    expect(onOpenSettings).toHaveBeenCalledOnce();
    await waitFor(() => expect(windowService.snapshot().mode).toBe('settings'));
  });
});
