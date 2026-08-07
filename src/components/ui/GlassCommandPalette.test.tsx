import {createRef} from 'react';
import {render, screen} from '@testing-library/react';
import {describe, expect, expectTypeOf, it, vi} from 'vitest';

import paletteStyles from '../../design-system/global.css?raw';
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

  it('preserves the frozen ordered EinUI exterior, surface, and specular topology', () => {
    const {container} = render(
      <GlassCommandPalette
        composer={<input aria-label="Ask or search" />}
        expanded={false}
      />,
    );

    const palette = container.firstElementChild;
    const directLayers = Array.from(palette?.children ?? []);
    const surface = directLayers[2];

    expect(palette).toHaveAttribute('data-upstream', 'einui-glass-command-palette');
    expect(palette).toHaveClass('einui-command-palette-wrapper', 'overflow-visible');
    expect(directLayers.map((layer) => layer.getAttribute('data-einui-layer')))
      .toEqual(['exterior-colour-glow', 'exterior-white-glow', 'surface']);
    expect(directLayers.slice(0, 2)).toHaveLength(2);
    for (const layer of directLayers.slice(0, 2)) {
      expect(layer).toHaveAttribute('aria-hidden', 'true');
      expect(layer).toHaveAttribute('data-palette-decoration', 'exterior');
    }
    expect(surface).toHaveClass('einui-command-palette', 'overflow-hidden', 'rounded-2xl', 'backdrop-blur-3xl');
    expect(surface).toHaveAttribute('data-material', 'raised');
    expect(Array.from(surface?.children ?? []).slice(0, 2).map((layer) => layer.getAttribute('data-einui-layer')))
      .toEqual(['specular-top', 'specular-corner']);
    for (const layer of Array.from(surface?.children ?? []).slice(0, 2)) {
      expect(layer).toHaveAttribute('aria-hidden', 'true');
      expect(layer).toHaveAttribute('data-palette-decoration', 'surface');
    }
  });

  it('adds owned chrome around slots and omits workspace regions while collapsed', () => {
    const {container, rerender} = render(
      <GlassCommandPalette
        body={<div data-slot="body">Live results</div>}
        composer={<div data-slot="composer">Ask or search</div>}
        expanded
        footer={<div data-slot="footer">Private</div>}
        scopes={<div data-slot="scopes">Files</div>}
      />,
    );

    expect(Array.from(container.querySelectorAll('[data-einui-slot]')).map((node) => node.getAttribute('data-einui-slot')))
      .toEqual(['composer', 'workspace', 'scopes', 'body', 'footer']);
    expect(container.querySelector('[data-einui-slot="composer"]')).toHaveClass('einui-command-composer');
    expect(container.querySelector('[data-einui-slot="workspace"]')).toHaveClass('einui-command-workspace');
    expect(container.querySelector('[data-einui-slot="body"]')).toHaveClass('einui-command-body');
    expect(container.querySelector('[data-einui-slot="footer"]')).toHaveClass('einui-command-footer');

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
    expect(container.querySelector('[data-einui-slot="workspace"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-einui-slot="footer"]')).not.toBeInTheDocument();
  });

  it('forwards its root ref and native div attributes without taking ownership of behavior', () => {
    const ref = createRef<HTMLDivElement>();

    render(
      <GlassCommandPalette
        ref={ref}
        composer={<input aria-label="Ask or search" />}
        expanded={false}
        id="lumen-command-palette"
        title="Command palette"
      />,
    );

    expect(ref.current).toHaveAttribute('id', 'lumen-command-palette');
    expect(ref.current).toHaveAttribute('title', 'Command palette');
    expect(ref.current).toHaveAttribute('data-expanded', 'false');
  });

  it('retains defined falsey caller slots', () => {
    const {container} = render(
      <GlassCommandPalette
        body={<div>Live results</div>}
        composer={<input aria-label="Ask or search" />}
        expanded
        footer={0}
        scopes={0}
      />,
    );

    expect(container.querySelector('[data-einui-slot="scopes"]')).toHaveTextContent('0');
    expect(container.querySelector('[data-einui-slot="footer"]')).toHaveTextContent('0');
  });

  it('pairs high-contrast highlight rows with the Windows highlight foreground', () => {
    expect(paletteStyles).toContain(`
[data-contrast='high'] .einui-command-row:hover,
[data-contrast='high'] .einui-command-row[aria-selected='true'] {
  background: Highlight;
  color: HighlightText;
}`);
    expect(paletteStyles).toContain(`
[data-contrast='high'] .einui-command-row:hover *,
[data-contrast='high'] .einui-command-row[aria-selected='true'] * {
  color: inherit;
}`);
  });

  it('uses a dedicated upstream-faithful 10 percent shortcut fill', () => {
    expect(paletteStyles).toContain('--einui-command-shortcut: rgba(255, 255, 255, 0.1);');
    expect(paletteStyles).toContain('background: var(--einui-command-shortcut);');
    expect(paletteStyles).toContain("[data-contrast='high'] .einui-command-palette-wrapper {");
    expect(paletteStyles).toContain('--einui-command-shortcut: Canvas;');
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
