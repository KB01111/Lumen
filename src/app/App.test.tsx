import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {App} from './App';

describe('App', () => {
  it('renders the Lumen application landmark', () => {
    render(<App />);

    expect(screen.getByRole('application', {name: 'Lumen'})).toBeVisible();
  });

  it('exposes the default system appearance axes on the application root', () => {
    render(<App />);

    expect(screen.getByRole('application', {name: 'Lumen'})).toHaveAttribute(
      'data-theme',
      'system',
    );
    expect(screen.getByRole('application', {name: 'Lumen'})).toHaveAttribute(
      'data-transparency',
      'native',
    );
    expect(screen.getByRole('application', {name: 'Lumen'})).toHaveAttribute(
      'data-effects',
      'full',
    );
    expect(screen.getByRole('application', {name: 'Lumen'})).toHaveAttribute(
      'data-motion',
      'system',
    );
  });
});
