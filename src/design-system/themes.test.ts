import {describe, expect, it} from 'vitest';
import {defaultAppearance, themeContracts} from './theme';

describe('Lumen theme contract', () => {
  it('exposes every required appearance axis', () => {
    expect(Object.keys(themeContracts)).toEqual([
      'light',
      'dark',
      'opaque',
      'highContrast',
      'reducedEffects',
      'reducedMotion',
    ]);
    expect(defaultAppearance).toEqual({
      mode: 'system',
      transparency: 'native',
      effects: 'full',
      motion: 'system',
    });
  });
});
