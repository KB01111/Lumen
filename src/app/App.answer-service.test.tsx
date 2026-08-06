import {render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

const {tauriAnswerService} = vi.hoisted(() => ({tauriAnswerService: vi.fn()}));

vi.mock('../services/answer/tauri-answer-service', () => ({
  TauriAnswerService: tauriAnswerService,
}));

import {App} from './App';

describe('App answer service composition', () => {
  it('does not construct the Tauri answer adapter in a browser runtime', () => {
    render(<App />);

    expect(screen.getByRole('application', {name: 'Lumen'})).toBeVisible();
    expect(tauriAnswerService).not.toHaveBeenCalled();
  });
});
