import * as stylex from '@stylexjs/stylex';
import {render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {
  darkOpaqueMaterialTheme,
  darkTheme,
  highContrastTheme,
  lightOpaqueMaterialTheme,
  lightTheme,
  reducedEffectsTheme,
  reducedMotionTheme,
} from '../design-system/themes.stylex';
import type {AppearancePreferences} from '../design-system/theme';
import {AppProviders} from './AppProviders';

const fullMotion: AppearancePreferences = {
  effects: 'full',
  mode: 'system',
  motion: 'full',
  transparency: 'native',
};

function mockMediaPreferences(matches: Partial<Record<string, boolean>>) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    addEventListener: () => undefined,
    matches: matches[query] ?? false,
    media: query,
    removeEventListener: () => undefined,
  }));
}

function renderAppearance(
  appearance: AppearancePreferences,
  forceHighContrast = false,
) {
  render(
    <AppProviders appearance={appearance} forceHighContrast={forceHighContrast}>
      <span>Child</span>
    </AppProviders>,
  );

  return screen.getByRole('application', {name: 'Lumen'});
}

function expectThemeBridge(root: HTMLElement, bridgeClassName: string | undefined) {
  expect(bridgeClassName).not.toBeUndefined();
  expect(root).toHaveClass('h-full', 'w-full', 'bg-transparent', 'font-sans', 'text-text-primary');
  expect(root.className.split(' ')).toEqual(
    expect.arrayContaining(bridgeClassName?.split(' ') ?? []),
  );
}

describe('AppProviders appearance bridge', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the light StyleX contract when system appearance resolves light', () => {
    mockMediaPreferences({'(prefers-color-scheme: dark)': false});

    const root = renderAppearance(fullMotion);

    expect(root).toHaveAttribute('data-resolved-theme', 'light');
    expectThemeBridge(root, stylex.props(lightTheme).className);
  });

  it('keeps the opaque StyleX contract alongside the Tailwind appearance data', () => {
    const root = renderAppearance({
      ...fullMotion,
      mode: 'dark',
      transparency: 'disabled',
    });

    expect(root).toHaveAttribute('data-transparency', 'disabled');
    expectThemeBridge(root, stylex.props(darkOpaqueMaterialTheme).className);
  });

  it('keeps the high-contrast StyleX contract for forced colors', () => {
    mockMediaPreferences({'(forced-colors: active)': true});

    const root = renderAppearance({...fullMotion, mode: 'dark'});

    expect(root).toHaveAttribute('data-contrast', 'high');
    expectThemeBridge(root, stylex.props(highContrastTheme).className);
  });

  it('composes reduced effect and motion StyleX contracts with the resolved theme', () => {
    const root = renderAppearance({
      effects: 'reduced',
      mode: 'dark',
      motion: 'reduced',
      transparency: 'native',
    });

    expect(root).toHaveAttribute('data-effects', 'reduced');
    expect(root).toHaveAttribute('data-reduced-motion', 'true');
    expectThemeBridge(root, stylex.props(
      darkTheme,
      reducedEffectsTheme,
      reducedMotionTheme,
    ).className);
  });

  it('keeps the light opaque contract when a light appearance disables transparency', () => {
    const root = renderAppearance({
      ...fullMotion,
      mode: 'light',
      transparency: 'disabled',
    });

    expect(root).toHaveAttribute('data-resolved-theme', 'light');
    expectThemeBridge(root, stylex.props(lightOpaqueMaterialTheme).className);
  });
});
