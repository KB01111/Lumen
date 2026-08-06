import {beforeEach, describe, expect, it, vi} from 'vitest';

const {eventChannel, invoke} = vi.hoisted(() => ({
  eventChannel: {current: undefined as ((payload: unknown) => void) | undefined},
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  Channel: class {
    constructor(callback: (payload: unknown) => void) {
      eventChannel.current = callback;
    }
  },
  invoke,
}));

import {TauriAnswerService} from './tauri-answer-service';

describe('TauriAnswerService', () => {
  beforeEach(() => {
    invoke.mockReset();
    eventChannel.current = undefined;
  });

  it('fails closed when the native channel sends an invalid event', async () => {
    invoke.mockResolvedValue(undefined);
    const service = new TauriAnswerService();
    const stream = service.stream({requestId: 1, query: 'status', mode: 'local', cloudConsent: false}, new AbortController().signal)[Symbol.asyncIterator]();
    const next = stream.next();

    await vi.waitFor(() => expect(eventChannel.current).toBeDefined());
    eventChannel.current?.({type: 'started', provider: 'local'});

    await expect(next).rejects.toThrow();
  });

  it('rejects oversized requests before invoking Tauri', async () => {
    const service = new TauriAnswerService();
    const stream = service.stream({requestId: 1, query: 'x'.repeat(4_001), mode: 'local', cloudConsent: false}, new AbortController().signal)[Symbol.asyncIterator]();

    await expect(stream.next()).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('forwards an abort even when native startup has not completed', async () => {
    invoke.mockImplementation((command: string) => command === 'start_answer'
      ? new Promise<void>(() => undefined)
      : Promise.resolve());
    const controller = new AbortController();
    const service = new TauriAnswerService();
    const stream = service.stream(
      {requestId: 29, query: 'cancel me', mode: 'cloud', cloudConsent: true},
      controller.signal,
    )[Symbol.asyncIterator]();
    const next = stream.next();

    await vi.waitFor(() => expect(eventChannel.current).toBeDefined());
    controller.abort();

    await expect(next).resolves.toMatchObject({done: true});
    expect(invoke).toHaveBeenCalledWith('cancel_answer', {requestId: 29});
  });
});
