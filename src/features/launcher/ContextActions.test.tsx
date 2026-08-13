import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';

import {AppProviders} from '../../app/AppProviders';
import type {SearchResult} from '../../services/search/search.types';
import {ContextActions} from './ContextActions';

const indexedResult: SearchResult = {
  id: 'indexed:report',
  name: 'Report.md',
  path: 'C:\\Projects\\Report.md',
  kind: 'document',
  availability: 'available',
  match: {source: 'content'},
  metadata: {},
  provenance: {
    extractionKind: 'text',
    fileHash: 'hash',
    indexRevision: 1,
  },
};

describe('ContextActions', () => {
  it('offers a compact pin action only for an indexed result', async () => {
    const user = userEvent.setup();
    const onPin = vi.fn();
    const view = render(
      <AppProviders>
        <ContextActions
          result={indexedResult}
          onDetails={vi.fn()}
          onOpen={vi.fn()}
          onOpenContainingFolder={vi.fn()}
          onPin={onPin}
        />
      </AppProviders>,
    );

    await user.click(screen.getByRole('button', {name: 'Pin selected result'}));
    expect(onPin).toHaveBeenCalledOnce();

    view.rerender(
      <AppProviders>
        <ContextActions
          result={{...indexedResult, pinned: true}}
          onDetails={vi.fn()}
          onOpen={vi.fn()}
          onOpenContainingFolder={vi.fn()}
          onPin={onPin}
        />
      </AppProviders>,
    );
    expect(screen.getByRole('button', {name: 'Unpin selected result'})).toBeEnabled();
  });
});
