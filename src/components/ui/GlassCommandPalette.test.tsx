import {render, screen} from '@testing-library/react';
import {describe, expect, expectTypeOf, it, vi} from 'vitest';

import {
  GlassCommandPalette,
  type GlassCommandPaletteProps,
} from './GlassCommandPalette';

describe('GlassCommandPalette', () => {
  it('renders caller-owned regions without installing a browser shortcut', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');

    render(
      <GlassCommandPalette
        body={<div>Live results</div>}
        composer={<input aria-label="Ask or search" />}
        expanded
        footer={<div>Private</div>}
      />,
    );

    expect(screen.getByRole('textbox', {name: 'Ask or search'})).toBeVisible();
    expect(screen.getByText('Live results')).toBeVisible();
    expect(addEventListener).not.toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('preserves the frozen EinUI surface, glow, and specular markers', () => {
    const {container} = render(
      <GlassCommandPalette
        composer={<input aria-label="Ask or search" />}
        expanded={false}
      />,
    );

    const palette = container.firstElementChild;

    expect(palette).toHaveAttribute('data-upstream', 'einui-glass-command-palette');
    expect(palette).toHaveClass('einui-command-palette', 'rounded-2xl', 'backdrop-blur-3xl');
    expect(palette?.querySelector('.einui-command-glow')).toHaveAttribute('aria-hidden', 'true');
    expect(palette?.querySelector('.einui-command-specular')).toHaveAttribute('aria-hidden', 'true');
  });

  it('orders caller slots and omits workspace regions while collapsed', () => {
    const {container, rerender} = render(
      <GlassCommandPalette
        body={<div data-slot="body">Live results</div>}
        composer={<div data-slot="composer">Ask or search</div>}
        expanded
        footer={<div data-slot="footer">Private</div>}
        scopes={<div data-slot="scopes">Files</div>}
      />,
    );

    expect(Array.from(container.querySelectorAll('[data-slot]')).map((node) => node.getAttribute('data-slot')))
      .toEqual(['composer', 'scopes', 'body', 'footer']);

    rerender(
      <GlassCommandPalette
        body={<div>Live results</div>}
        composer={<div>Ask or search</div>}
        expanded={false}
        footer={<div>Private</div>}
        scopes={<div>Files</div>}
      />,
    );

    expect(screen.queryByText('Live results')).not.toBeInTheDocument();
    expect(screen.queryByText('Private')).not.toBeInTheDocument();
    expect(screen.queryByText('Files')).not.toBeInTheDocument();
  });

  it('keeps command and demo concerns outside the component contract', () => {
    type ForbiddenPaletteProp = Extract<
      keyof GlassCommandPaletteProps,
      | 'action'
      | 'commands'
      | 'groups'
      | 'href'
      | 'onOpenChange'
      | 'onQueryChange'
      | 'onSelect'
      | 'open'
      | 'placeholder'
      | 'position'
      | 'query'
      | 'results'
    >;

    expectTypeOf<ForbiddenPaletteProp>().toEqualTypeOf<never>(undefined as never);
  });
});
