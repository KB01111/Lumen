import {describe, expect, it} from 'vitest';
import {themeContracts} from './themes.stylex';

describe('Lumen themes', () => {
  it('defines every required theme axis', () => {
    expect(Object.keys(themeContracts)).toEqual([
      'light',
      'dark',
      'opaque',
      'highContrast',
      'reducedEffects',
      'reducedMotion',
    ]);
  });
});
