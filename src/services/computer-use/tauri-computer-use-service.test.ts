import {afterEach, describe, expect, it, vi} from 'vitest';

import type {ComputerUseRequest} from './computer-use.types';
import {TauriComputerUseService} from './tauri-computer-use-service';

const tauri = vi.hoisted(() => ({
  channels: [] as Array<(payload: unknown) => void>,
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  Channel: class Channel {
    constructor(onMessage: (payload: unknown) => void) {
      tauri.channels.push(onMessage);
    }
  },
  invoke: tauri.invoke,
}));

const request: ComputerUseRequest = {
  taskId: 17,
  task: 'Find the Lumen repository',
  model: 'gemini-3.6-flash',
  initialUrl: 'https://www.google.com',
  cloudConsent: true,
};

afterEach(() => {
  tauri.channels.length = 0;
  tauri.invoke.mockReset();
});

describe('TauriComputerUseService', () => {
  it('cancels again after startup resolves when abort raced with startup', async () => {
    let finishStarting: (() => void) | undefined;
    tauri.invoke.mockImplementation((command: string) => {
      if (command === 'start_computer_use') {
        return new Promise<void>((resolve) => {
          finishStarting = resolve;
        });
      }
      return Promise.resolve();
    });
    const controller = new AbortController();
    const iterator = new TauriComputerUseService().stream(request, controller.signal)[Symbol.asyncIterator]();
    const pending = iterator.next();

    await vi.waitFor(() => expect(finishStarting).toBeTypeOf('function'));
    controller.abort();
    await expect(pending).resolves.toEqual({done: true, value: undefined});
    finishStarting!();

    await vi.waitFor(() => expect(tauri.invoke.mock.calls.filter(
      ([command]) => command === 'cancel_computer_use',
    )).toHaveLength(2));
  });

  it('fails closed when the native channel sends an invalid event', async () => {
    tauri.invoke.mockResolvedValue(undefined);
    const iterator = new TauriComputerUseService().stream(request, new AbortController().signal)[Symbol.asyncIterator]();
    const pending = iterator.next();

    await vi.waitFor(() => expect(tauri.channels).toHaveLength(1));
    tauri.channels[0]({type: 'unknownNativeEvent'});

    await expect(pending).rejects.toThrow();
  });
});
