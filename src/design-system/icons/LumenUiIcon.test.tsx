import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {LumenUiIcon} from './LumenUiIcon';

describe('LumenUiIcon', () => {
  it('renders interface icons as decorative current-color SVGs', () => {
    render(<span data-testid="host"><LumenUiIcon name="search" size="medium" /></span>);
    const icon = screen.getByTestId('host').querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveAttribute('focusable', 'false');
    expect(icon).toHaveClass('size-5');
  });

  it('exposes distinct semantic interface glyphs', () => {
    render(
      <>
        <LumenUiIcon data-testid="speed" name="speed" />
        <LumenUiIcon data-testid="clock" name="clock" />
        <LumenUiIcon data-testid="color-theme" name="colorTheme" />
        <LumenUiIcon data-testid="pulse" name="pulse" />
        <LumenUiIcon data-testid="storage" name="storage" />
        <LumenUiIcon data-testid="bolt" name="bolt" />
        <LumenUiIcon data-testid="info" name="info" />
      </>,
    );

    expect(screen.getAllByTestId(/speed|clock|color-theme|pulse|storage|bolt|info/)).toHaveLength(7);
  });

  it('forwards SVG props while merging caller classes and size variants', () => {
    render(
      <>
        <LumenUiIcon className="size-7 text-accent" data-origin="caller" data-testid="custom" height={17} name="search" width={13} />
        <LumenUiIcon data-testid="small" name="search" size="small" />
        <LumenUiIcon data-testid="large" name="search" size="large" />
      </>,
    );

    const custom = screen.getByTestId('custom');
    expect(custom).toHaveAttribute('data-origin', 'caller');
    expect(custom).toHaveAttribute('height', '17');
    expect(custom).toHaveAttribute('width', '13');
    expect(custom).toHaveClass('size-7', 'text-accent');
    expect(screen.getByTestId('small')).toHaveClass('size-4');
    expect(screen.getByTestId('large')).toHaveClass('size-6');
  });
});
