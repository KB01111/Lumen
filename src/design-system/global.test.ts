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
  --einui-command-row: color-mix(in srgb, var(--lumen-text-primary) 4%, transparent);
  --einui-command-row-hover: color-mix(in srgb, var(--lumen-text-primary) 5%, transparent);
  --einui-command-row-selected: color-mix(in srgb, var(--lumen-accent) 11%, transparent);
  --einui-command-row-selected-edge: color-mix(in srgb, var(--lumen-accent) 24%, transparent);
  --einui-command-tray: color-mix(in srgb, var(--lumen-surface-inset) 45%, transparent);
  --einui-command-shadow: var(--lumen-shadow-surface);
}`);
  });

  it('uses the midnight-tinted opaque surfaces in light and dark themes', () => {
    expect(normalizedCss).toContain(`
[data-transparency='disabled'] {
  --lumen-canvas: #f2f5f8;
  --lumen-surface-glass: #fafcfd;
  --lumen-surface-raised: #ffffff;
  --lumen-surface-inset: #e4eaf0;
}`);
    expect(normalizedCss).toContain(`
[data-resolved-theme='dark']:where([data-transparency='disabled']) {
  --lumen-canvas: #070b10;
  --lumen-surface-glass: #0d131b;
  --lumen-surface-raised: #17202b;
  --lumen-surface-inset: #05090e;
}`);
  });

  it('uses one semantic accent for the command palette glow', () => {
    const glowRuleMatch = normalizedCss.match(
      /\.einui-command-exterior-colour-glow\s*\{[^}]*\}/s,
    );
    expect(glowRuleMatch).toBeTruthy();

    const glowRule = glowRuleMatch![0];
    expect(glowRule).toContain('var(--lumen-accent)');
    expect(glowRule).toContain(
      'background: radial-gradient(circle, color-mix(in srgb, var(--lumen-accent) 22%, transparent) 0%, transparent 72%);',
    );
    expect(glowRule).not.toMatch(/rgba\(\d+,\s*\d+,\s*\d+/);
    expect(glowRule).not.toMatch(/rgb\(\d+,\s*\d+,\s*\d+/);
    expect(glowRule).not.toMatch(/#[0-9a-fA-F]{3,8}(?![^}]*var\()/);
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
  it('removes the decorative beam and bloom in reduced effects', () => {
    expect(normalizedCss).toContain(`
[data-effects='reduced'] .einui-command-specular-top,
[data-effects='reduced'] [data-material-layer='luminosity'] {
  display: none;
}`);
  });

  it('keeps the Lottie activity mark semantic and static in forced colors', () => {
    expect(normalizedCss).toContain(`
.lumen-activity-lottie path {
  fill: currentColor !important;
}`);
    expect(normalizedCss).toContain(`
  .lumen-activity-lottie {
    display: none;
  }

  .lumen-activity-forced-fallback {
    display: inline-flex;
  }`);
  });
});
