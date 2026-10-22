import {describe, expect, it} from 'vitest';

import {shortcutAriaLabel, shortcutHintLabel, shortcutKeys} from './shortcut-format';

describe('shortcut formatting', () => {
  it('splits a chord on its spaced delimiter', () => {
    expect(shortcutKeys('Ctrl + Shift + K')).toEqual(['Ctrl', 'Shift', 'K']);
    expect(shortcutAriaLabel('Ctrl + Shift + K')).toBe('Ctrl plus Shift plus K');
    expect(shortcutHintLabel('Alt + Space')).toBe('Alt\u00a0\u00a0Space');
  });

  it('keeps a literal plus key as the activation key', () => {
    expect(shortcutKeys('Ctrl + Shift + +')).toEqual(['Ctrl', 'Shift', '+']);
    expect(shortcutAriaLabel('Ctrl + +')).toBe('Ctrl plus +');
  });
});
