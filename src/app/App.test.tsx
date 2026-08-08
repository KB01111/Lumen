import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {defaultAppearance} from '../design-system/theme';
import {App} from './App';

describe('App', () => {
  it('renders the Lumen application landmark', () => {
    render(<App />);

    expect(screen.getByRole('application', {name: 'Lumen'})).toBeVisible();
  });

  it('preserves the framework-independent appearance contract on the application root', () => {
    render(<App />);

    const root = screen.getByRole('application', {name: 'Lumen'});
    expect(root).toHaveAttribute('data-theme', defaultAppearance.mode);
    expect(root).toHaveAttribute('data-resolved-theme', 'light');
    expect(root).toHaveAttribute('data-transparency', defaultAppearance.transparency);
    expect(root).toHaveAttribute('data-contrast', 'standard');
    expect(root).toHaveAttribute('data-effects', defaultAppearance.effects);
    expect(root).toHaveAttribute('data-motion', defaultAppearance.motion);
    expect(root).toHaveAttribute('data-reduced-motion', 'false');
  });
});
