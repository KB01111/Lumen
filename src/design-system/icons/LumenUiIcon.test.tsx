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
});
