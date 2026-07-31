import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {AppProviders} from '../../app/AppProviders';
import {VisualStateGallery} from './VisualStateGallery';
import {galleryScenarios} from './scenarios';
import {requiredScenarioIds} from './gallery.types';

describe('VisualStateGallery', () => {
  it('contains every required deterministic scenario exactly once', () => {
    expect(new Set(galleryScenarios.map((item) => item.id))).toEqual(new Set(requiredScenarioIds));
    expect(galleryScenarios).toHaveLength(requiredScenarioIds.length);
  });

  it('renders production activity state inside the gallery surface', () => {
    window.history.replaceState({}, '', '/?gallery=1&scenario=activity-gaming');
    render(
      <AppProviders appearance={{mode: 'dark', transparency: 'native', effects: 'full', motion: 'reduced'}}>
        <VisualStateGallery />
      </AppProviders>,
    );

    expect(screen.getByRole('region', {name: 'Lumen visual state gallery'})).toHaveAttribute('data-gallery-scenario', 'activity-gaming');
    expect(screen.getByTestId('activity-gaming')).toBeVisible();
  });
});
