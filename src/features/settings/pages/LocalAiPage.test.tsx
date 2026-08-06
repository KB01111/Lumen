import {render, screen, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {AppProviders} from '../../../app/AppProviders';
import {nativeAiService} from '../../../services/ai/native-ai-service';
import {LocalAiPage} from './LocalAiPage';

vi.mock('../../../services/ai/native-ai-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/ai/native-ai-service')>();
  return {
    ...actual,
    isNativeRuntime: () => true,
    nativeAiService: {
      ...actual.nativeAiService,
      localRuntimeHealth: vi.fn(),
      setLocalRuntimeMode: vi.fn(),
    },
  };
});

describe('LocalAiPage native refresh', () => {
  beforeEach(() => {
    vi.mocked(nativeAiService.localRuntimeHealth).mockReset();
    vi.mocked(nativeAiService.setLocalRuntimeMode).mockReset();
    vi.mocked(nativeAiService.localRuntimeHealth).mockResolvedValue({
      profile: 'generic-local',
      state: 'ready',
      accelerator: 'CPU',
      answerModel: 'qwen3.5:4b',
      embeddingModel: 'embed-gemma:300m',
      transcriptionModel: 'whisper',
      baseUrl: 'http://127.0.0.1:13305/api/v1',
      lemonade: {installed: true, version: '10.0', requiredVersion: '10.0', state: 'ready'},
      flm: {installed: true, version: '0.9.43', requiredVersion: '0.9.43', state: 'ready'},
      mistralRs: {installed: false, requiredVersion: '0.7', state: 'missing'},
    });
  });

  it('refreshes native health when a deterministic preview model is removed', async () => {
    const appearance = {
      mode: 'dark' as const,
      transparency: 'disabled' as const,
      effects: 'reduced' as const,
      motion: 'reduced' as const,
    };
    const {rerender} = render(
      <AppProviders appearance={appearance}>
        <LocalAiPage model={{hardware: 'cpu', state: 'ready'}} />
      </AppProviders>,
    );

    expect(nativeAiService.localRuntimeHealth).not.toHaveBeenCalled();

    rerender(
      <AppProviders appearance={appearance}>
        <LocalAiPage />
      </AppProviders>,
    );

    await waitFor(() => expect(nativeAiService.localRuntimeHealth).toHaveBeenCalledOnce());
  });

  it('renders detected stopped health without preview download or retry actions', async () => {
    vi.mocked(nativeAiService.localRuntimeHealth).mockResolvedValue({
      profile: 'generic-local',
      state: 'stopped',
      accelerator: 'CPU',
      answerModel: 'qwen3.5:4b',
      embeddingModel: 'embed-gemma:300m',
      transcriptionModel: 'whisper',
      baseUrl: 'http://127.0.0.1:13305/api/v1',
      lemonade: {installed: true, version: '10.0', requiredVersion: '10.0', state: 'ready'},
      flm: {installed: true, version: '0.9.43', requiredVersion: '0.9.43', state: 'ready'},
      mistralRs: {installed: false, requiredVersion: '0.7', state: 'missing'},
    });

    render(<AppProviders><LocalAiPage /></AppProviders>);

    expect(await screen.findByText('Runtime stopped')).toBeVisible();
    expect(screen.getByRole('button', {name: 'Refresh local runtime'})).toBeVisible();
    expect(screen.queryByRole('button', {name: /Download preview/i})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: /Retry preview/i})).not.toBeInTheDocument();
  });
});
