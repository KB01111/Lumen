import {describe, expect, it} from 'vitest';

import {cn} from './cn';

describe('cn', () => {
  it('merges conditional classes and resolves Tailwind conflicts', () => {
    expect(cn('px-2 text-sm', {hidden: false}, 'px-4')).toBe('text-sm px-4');
  });
});
