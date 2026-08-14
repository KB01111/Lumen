import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it} from 'vitest';

import {MemoryAnswerService} from '../../services/answer/memory-answer-service';
import {BrowserWindowService} from '../../platform/window/browser-window-service';
import {MemorySearchService} from '../../services/search/memory-search-service';
import {usePreviewStore} from '../launcher/preview.store';
import {useSettingsStore} from '../settings/settings.store';
import {useLauncherStore} from './launcher.store';
import {useQueryStore} from './query.store';
import {useScopeStore} from './scope.store';
import {useSelectionStore} from './selection.store';
import {SearchExperience} from './SearchExperience';

function file(id: string) {
  return {
    id,
    name: `${id}.md`,
    path: `C:\\Projects\\Lumen\\${id}.md`,
    kind: 'document' as const,
    match: {source: 'filename' as const, fragment: id},
    metadata: {extension: 'md'},
    availability: 'available' as const,
  };
}

afterEach(() => {
  useLauncherStore.getState().reset();
  usePreviewStore.getState().reset();
  useQueryStore.getState().reset();
  useScopeStore.getState().reset();
  useSelectionStore.getState().reset();
  useSettingsStore.getState().reset();
});

describe('SearchExperience answer submission', () => {
  it('keeps the warm launcher marker on a Tailwind contents wrapper', () => {
    const {container} = render(
      <SearchExperience
        service={new MemorySearchService()}
        windowService={new BrowserWindowService()}
      />,
    );

    const wrapper = container.querySelector<HTMLElement>('[data-launcher-visible]');
    expect(wrapper).toHaveClass('contents');
    expect(wrapper).not.toHaveAttribute('style');
  });

  it('keeps the single launcher indicator active while an answer waits and streams', async () => {
    const user = userEvent.setup();
    const service = new MemorySearchService();
    const answers = new MemoryAnswerService();
    const {container} = render(
      <SearchExperience
        answerService={answers}
        service={service}
        windowService={new BrowserWindowService()}
      />,
    );

    const input = screen.getByRole('searchbox', {name: 'Search files'});
    await user.type(input, 'release');
    await waitFor(() => expect(
      service.requests.some(({request}) => request.query === 'release'),
    ).toBe(true));
    await act(() => service.resolve('release', []));
    await user.keyboard('{Enter}');

    const activityIndicator = container.querySelector('[data-activity-indicator]');
    expect(await screen.findByText('Answering', {selector: 'output span'})).toBeVisible();
    expect(activityIndicator).toHaveAttribute(
      'data-activity-state',
      'active',
    );

    await waitFor(() => expect(answers.requests).toHaveLength(1));
    await act(() => answers.emit('release', {
      type: 'started', provider: 'memory', model: 'memory', route: 'local',
    }));
    expect(screen.getByText('Answering', {selector: 'output span'})).toBeVisible();

    await act(() => answers.emit('release', {
      type: 'completed', provider: 'memory', model: 'memory', route: 'local',
    }));
    await waitFor(() => expect(screen.queryByText('Answering', {selector: 'output span'}))
      .not.toBeInTheDocument());
    expect(activityIndicator).toHaveAttribute(
      'data-activity-state',
      'idle',
    );
  });

  it('keeps the real streaming answer region mounted when local search fails', async () => {
    const user = userEvent.setup();
    const service = new MemorySearchService();
    const answers = new MemoryAnswerService();
    render(
      <SearchExperience
        answerService={answers}
        service={service}
        windowService={new BrowserWindowService()}
      />,
    );

    const input = screen.getByRole('searchbox', {name: 'Search files'});
    await user.type(input, 'release');
    await waitFor(() => expect(
      service.requests.some(({request}) => request.query === 'release'),
    ).toBe(true));
    await user.keyboard('{Enter}');
    await waitFor(() => expect(answers.requests).toHaveLength(1));
    await act(() => answers.emit('release', {type: 'delta', text: 'Streaming answer.'}));

    const answerRegion = await screen.findByTestId('answer-region');
    await act(() => service.reject('release', {
      code: 'search-failed', message: 'Local search is unavailable.', recoverable: true,
    }));

    await waitFor(() => expect(screen.getByRole('grid', {name: 'Search results'}))
      .toHaveTextContent('Local search is unavailable.'));
    expect(screen.getByTestId('answer-region')).toBe(answerRegion);
    expect(answerRegion).toHaveTextContent('Streaming answer.');
  });

  it('searches while typing without starting an answer stream', async () => {
    const user = userEvent.setup();
    const service = new MemorySearchService();
    const answers = new MemoryAnswerService();
    render(
      <SearchExperience
        answerService={answers}
        service={service}
        windowService={new BrowserWindowService()}
      />,
    );

    await user.type(screen.getByRole('searchbox', {name: 'Search files'}), 'release');

    await waitFor(() => expect(
      service.requests.some(({request}) => request.query === 'release'),
    ).toBe(true));
    expect(answers.requests).toHaveLength(0);
    expect(screen.queryByRole('region', {name: 'AI answer'})).not.toBeInTheDocument();
  });

  it('submits one answer request only for plain Enter in the composer', async () => {
    const user = userEvent.setup();
    const service = new MemorySearchService();
    const answers = new MemoryAnswerService();
    render(
      <SearchExperience
        answerService={answers}
        service={service}
        windowService={new BrowserWindowService()}
      />,
    );

    const input = screen.getByRole('searchbox', {name: 'Search files'});
    await user.type(input, 'summarize the release');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(answers.requests).toHaveLength(1));
    expect(await screen.findByRole('region', {name: 'AI answer'})).toBeVisible();
    expect(screen.getAllByTestId('answer-region')).toHaveLength(1);
    expect(answers.requests[0]?.request).toMatchObject({
      query: 'summarize the release',
      mode: 'auto',
      cloudConsent: false,
    });
  });

  it('does not submit an answer while IME composition is active', async () => {
    const service = new MemorySearchService();
    const answers = new MemoryAnswerService();
    render(
      <SearchExperience
        answerService={answers}
        service={service}
        windowService={new BrowserWindowService()}
      />,
    );

    const input = screen.getByRole('searchbox', {name: 'Search files'});
    fireEvent.compositionStart(input);
    fireEvent.input(input, {target: {value: 'ルーメン'}});
    fireEvent.keyDown(input, {key: 'Enter', isComposing: true});

    expect(answers.requests).toHaveLength(0);
    expect(useQueryStore.getState().submitted).toBe('');
  });

  it('cancels the prior stream when the composer retries the same submission', async () => {
    const user = userEvent.setup();
    const service = new MemorySearchService();
    const answers = new MemoryAnswerService();
    render(
      <SearchExperience
        answerService={answers}
        service={service}
        windowService={new BrowserWindowService()}
      />,
    );

    const input = screen.getByRole('searchbox', {name: 'Search files'});
    await user.type(input, 'retry the release');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(answers.requests).toHaveLength(1));
    const firstSignal = answers.requests[0]?.signal;

    await user.keyboard('{Enter}');

    await waitFor(() => expect(answers.requests).toHaveLength(2));
    expect(firstSignal?.aborted).toBe(true);
    expect(answers.requests[1]?.request.query).toBe('retry the release');
  });

  it('opens the focused result instead of submitting an answer', async () => {
    const user = userEvent.setup();
    const service = new MemorySearchService();
    const answers = new MemoryAnswerService();
    render(
      <SearchExperience
        answerService={answers}
        service={service}
        windowService={new BrowserWindowService()}
      />,
    );

    const input = screen.getByRole('searchbox', {name: 'Search files'});
    await user.type(input, 'release');
    await waitFor(() => expect(
      service.requests.some(({request}) => request.query === 'release'),
    ).toBe(true));
    await act(() => service.resolve('release', [{
      id: 'release',
      name: 'release.md',
      path: 'C:\\Projects\\Lumen\\release.md',
      kind: 'document',
      match: {source: 'filename', fragment: 'release'},
      metadata: {extension: 'md'},
      availability: 'available',
    }]));
    await screen.findByRole('row', {name: /release\.md/i});

    await user.keyboard('{Tab}{Tab}{Enter}');

    await waitFor(() => expect(service.openedFiles).toEqual(['release']));
    expect(answers.requests).toHaveLength(0);
  });

  it('blocks file-detail preview work when previews are disabled', async () => {
    const user = userEvent.setup();
    const service = new MemorySearchService();
    useSettingsStore.setState((state) => ({
      privacy: {...state.privacy, previewsEnabled: false},
    }));
    render(
      <SearchExperience
        service={service}
        windowService={new BrowserWindowService()}
      />,
    );

    await user.type(screen.getByRole('searchbox', {name: 'Search files'}), 'release');
    await waitFor(() => expect(service.requests.some(({request}) => request.query === 'release')).toBe(true));
    await act(() => service.resolve('release', [file('release')]));
    await screen.findByRole('row', {name: /release\.md/i});
    await import('../preview/PreviewPane');
    act(() => useSelectionStore.getState().select('release'));
    expect(screen.getByRole('button', {name: 'Show file details'})).toBeEnabled();
    await user.click(screen.getByRole('button', {name: 'Show file details'}));
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 50)));

    expect(service.previewRequests).toHaveLength(0);
    expect(screen.queryByRole('dialog', {name: 'File details'})).not.toBeInTheDocument();
    expect(screen.getByTestId('search-announcement')).toHaveTextContent('File previews are disabled');
  });
});
