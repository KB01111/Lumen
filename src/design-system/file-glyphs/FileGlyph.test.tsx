import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {fileKinds} from './file-kind';
import {FileGlyph} from './FileGlyph';

describe('FileGlyph', () => {
  it.each(fileKinds)('renders a neutral %s glyph with an accessible title', (kind) => {
    const {container} = render(<FileGlyph kind={kind} title={`${kind} file`} />);

    expect(screen.getByTitle(`${kind} file`)).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('stroke', 'currentColor');
  });

  it('is decorative when no title is provided', () => {
    const {container} = render(<FileGlyph kind="document" />);

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('exposes selected state without changing its geometry', () => {
    const {rerender} = render(<FileGlyph kind="source" selected />);
    const selected = screen.getByTestId('file-glyph');
    const viewBox = selected.querySelector('svg')?.getAttribute('viewBox');

    expect(selected).toHaveAttribute('data-selected', 'true');
    rerender(<FileGlyph kind="source" selected={false} />);
    expect(screen.getByTestId('file-glyph').querySelector('svg')).toHaveAttribute(
      'viewBox',
      viewBox,
    );
  });
});

