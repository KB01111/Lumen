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
    let startFailure: unknown;
    const channel = new Channel<unknown>((payload) => {
      try {
        const event = computerUseEventSchema.parse(payload);
        queued.push(event);
        finished ||= terminal(event);
      } catch (error) {
        startFailure = error;
        finished = true;
      }
      wake?.();
      wake = undefined;
    });
    const cancel = () => {
      void invoke('cancel_computer_use', {taskId: request.taskId});
      finished = true;
      wake?.();
      wake = undefined;
    };
    signal.addEventListener('abort', cancel, {once: true});
    void invoke<void>('start_computer_use', {request, onEvent: channel})
      .then(() => {
        if (signal.aborted) {
          return invoke('cancel_computer_use', {taskId: request.taskId});
        }
      })
      .catch((error: unknown) => {
        startFailure = error;
        finished = true;
        wake?.();
        wake = undefined;
      });

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
      if (!finished) cancel();
    }
  }

  respond(taskId: number, approvalId: string, approved: boolean) {
    return invoke<void>('respond_computer_use_approval', {taskId, approvalId, approved});
  }
}
