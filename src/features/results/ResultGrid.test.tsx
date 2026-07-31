import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';

import type {SearchResult} from '../../services/search/search.types';
import {ResultGrid} from './ResultGrid';

function file(id: string, overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id,
    name: `${id}.tsx`,
    path: `C:\\Projects\\Lumen\\src\\${id}.tsx`,
    kind: 'source',
    match: {source: 'content', fragment: `export function ${id}()`},
    metadata: {
      extension: 'tsx',
      modifiedAt: '2026-07-31T10:00:00.000Z',
      sizeBytes: 2048,
    },
    availability: 'available',
    ...overrides,
  };
}

describe('ResultGrid', () => {
  it('keeps the selected file when a result is inserted above it', () => {
    const {rerender} = render(
      <ResultGrid results={[file('a'), file('b')]} selectedId="b" />,
    );

    rerender(
      <ResultGrid
        results={[file('new'), file('a'), file('b')]}
        selectedId="b"
      />,
    );

    expect(screen.getByRole('row', {name: /b\.tsx/i})).toHaveAttribute(
      'data-selected',
      'true',
    );
  });

  it('selects an available row and labels unavailable states without color alone', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <ResultGrid
        results={[
          file('ready'),
          file('denied', {availability: 'permissionDenied'}),
        ]}
        selectedId={null}
        onSelectionChange={onSelectionChange}
      />,
    );

    await user.click(screen.getByRole('row', {name: /ready\.tsx/i}));
    expect(onSelectionChange).toHaveBeenCalledWith('ready');
    expect(screen.getByRole('row', {name: /permission required/i})).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('activates the row that was clicked by stable ID', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <ResultGrid
        results={[file('alpha'), file('beta')]}
        selectedId="alpha"
        onAction={onAction}
      />,
    );

    await user.click(screen.getByRole('row', {name: /beta\.tsx/i}));

    expect(onAction).toHaveBeenCalledWith('beta');
  });

  it('virtualizes 10,000 results with a bounded mounted row count', async () => {
    const results = Array.from({length: 10_000}, (_, index) => file(`file-${index}`));
    const {container} = render(
      <ResultGrid results={results} selectedId="file-0" maxHeight={400} />,
    );

    await waitFor(() =>
      expect(container.querySelectorAll('[data-result-id]').length).toBeGreaterThan(0),
    );
    expect(screen.getByRole('grid', {name: 'Search results'})).toHaveAttribute(
      'aria-rowcount',
      '10000',
    );
    expect(container.querySelectorAll('[data-result-id]').length).toBeLessThan(40);
  });
});
