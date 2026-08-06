import {Channel, invoke} from '@tauri-apps/api/core';

import type {ComputerUseService} from './computer-use-service';
import {
  computerUseEventSchema,
  computerUseHealthSchema,
  type ComputerUseEvent,
  type ComputerUseRequest,
} from './computer-use.types';

function terminal(event: ComputerUseEvent) {
  return event.type === 'completed' || event.type === 'cancelled' || event.type === 'failed';
}

export class TauriComputerUseService implements ComputerUseService {
  async health() {
    return computerUseHealthSchema.parse(await invoke('computer_use_health'));
  }

  async *stream(request: ComputerUseRequest, signal: AbortSignal): AsyncIterable<ComputerUseEvent> {
    const queued: ComputerUseEvent[] = [];
    let wake: (() => void) | undefined;
    let finished = false;
    let workerTerminal = false;
    let startFailure: unknown;
    let startupFailed = false;
    let cancellation: Promise<void> | undefined;
    const channel = new Channel<unknown>((payload) => {
      try {
        const event = computerUseEventSchema.parse(payload);
        queued.push(event);
        workerTerminal ||= terminal(event);
        finished ||= workerTerminal;
      } catch (error) {
        startFailure = error;
        finished = true;
      }
      wake?.();
      wake = undefined;
    });
    const startup = invoke<void>('start_computer_use', {request, onEvent: channel})
      .catch((error: unknown) => {
        startupFailed = true;
        startFailure = error;
        finished = true;
        wake?.();
        wake = undefined;
      });
    const cancel = () => {
      cancellation ??= startup.then(async () => {
        if (!startupFailed) {
          await invoke<void>('cancel_computer_use', {taskId: request.taskId});
        }
      });
      finished = true;
      wake?.();
      wake = undefined;
    };
    signal.addEventListener('abort', cancel, {once: true});

    try {
      while (!finished || queued.length > 0) {
        if (signal.aborted) return;
        if (queued.length === 0) {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
          continue;
        }
        yield queued.shift()!;
      }
      if (startFailure) {
        throw startFailure instanceof Error ? startFailure : new Error(String(startFailure));
      }
    } finally {
      signal.removeEventListener('abort', cancel);
      if (!workerTerminal) cancel();
      await cancellation;
    }
  }

  respond(taskId: number, approvalId: string, approved: boolean) {
    return invoke<void>('respond_computer_use_approval', {taskId, approvalId, approved});
  }

  cancelActive() {
    return invoke<void>('cancel_computer_use', {taskId: null});
  }
}
