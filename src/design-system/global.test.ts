import {describe, expect, it} from 'vitest';

import css from './global.css?raw';

const normalizedCss = css.replace(/\r\n/g, '\n');

describe('Lumen CSS appearance contract', () => {
  it('maps the translucent light command palette to readable semantic colors', () => {
    expect(normalizedCss).toContain(`
[data-resolved-theme='light'] .einui-command-palette-wrapper {
  --einui-command-surface: var(--lumen-surface-raised);
  --einui-command-text: var(--lumen-text-primary);
  --einui-command-muted-text: var(--lumen-text-secondary);
  --einui-command-border: var(--lumen-border-strong);
  --einui-command-divider: var(--lumen-border-subtle);
  --einui-command-row: var(--lumen-surface-inset);
  --einui-command-row-hover: var(--lumen-surface-inset);
  --einui-command-row-selected: var(--lumen-surface-inset);
  --einui-command-shortcut: var(--lumen-surface-raised);
  --einui-command-shadow: var(--lumen-shadow-control);
}`);
  });

  it('uses solid light and dark semantic surfaces when transparency is disabled', () => {
    expect(normalizedCss).toContain(`
[data-transparency='disabled'] {
  --lumen-canvas: #edf3f7;
  --lumen-surface-glass: #f4f8fb;
  --lumen-surface-raised: #ffffff;
  --lumen-surface-inset: #e2ebf1;
}`);
    expect(normalizedCss).toContain(`
[data-resolved-theme='dark']:where([data-transparency='disabled']) {
  --lumen-canvas: #071017;
  --lumen-surface-glass: #111c27;
  --lumen-surface-raised: #223246;
  --lumen-surface-inset: #0b141d;
}`);
  });

  it('maps every shared semantic Tailwind color role to system colors in high contrast', () => {
    expect(normalizedCss).toContain(`
[data-contrast='high'] {
  --lumen-canvas: Canvas;
  --lumen-surface-glass: Canvas;
  --lumen-surface-raised: ButtonFace;
  --lumen-surface-inset: ButtonFace;
  --lumen-text-primary: CanvasText;
  --lumen-text-secondary: CanvasText;
  --lumen-text-tertiary: CanvasText;
  --lumen-text-inverse: HighlightText;
  --lumen-text-button: ButtonText;
  --lumen-accent: Highlight;
  --lumen-focus: Highlight;
  --lumen-border-subtle: CanvasText;
  --lumen-border-strong: CanvasText;
  --lumen-border-specular: CanvasText;
  --lumen-success: CanvasText;
  --lumen-warning: CanvasText;
  --lumen-danger: CanvasText;
  --lumen-scrim: Canvas;
  --lumen-shadow-surface: none;
  --lumen-shadow-control: none;
}`);
  });
});
