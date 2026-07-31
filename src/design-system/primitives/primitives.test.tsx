import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';

import {LumenMark} from '../icons/LumenMark';
import {LumenButton} from './LumenButton';
import {LumenIconButton} from './LumenIconButton';
import {LumenSurface} from './LumenSurface';
import {LumenText} from './LumenText';

describe('Lumen primitives', () => {
  it('exposes accessible keyboard-operable buttons', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();

    render(
      <>
        <LumenButton onPress={onPress}>Search everywhere</LumenButton>
        <LumenIconButton aria-label="Open settings">
          <LumenMark />
        </LumenIconButton>
      </>,
    );

    const action = screen.getByRole('button', {name: 'Search everywhere'});
    expect(screen.getByRole('button', {name: 'Open settings'})).toBeVisible();

    await user.tab();
    expect(action).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onPress).toHaveBeenCalledOnce();
  });

  it('keeps material decoration out of the accessibility tree', () => {
    render(
      <LumenSurface material="mica" aria-label="Search surface">
        <LumenText as="h1" variant="display">
          Find anything
        </LumenText>
      </LumenSurface>,
    );

    const surface = screen.getByLabelText('Search surface');
    expect(surface).toHaveAttribute('data-material', 'mica');
    expect(screen.getByRole('heading', {name: 'Find anything'})).toBeVisible();
    expect(surface.querySelectorAll('[aria-hidden="true"]')).toHaveLength(3);
  });

  it('uses the shared 24-unit icon geometry', () => {
    const {container} = render(<LumenMark title="Lumen" />);
    const icon = container.querySelector('svg');

    expect(icon).toHaveAttribute('viewBox', '0 0 24 24');
    expect(icon).toHaveAttribute('aria-label', 'Lumen');
    expect(icon?.querySelector('[vector-effect="non-scaling-stroke"]')).not.toBeNull();
  });
});
