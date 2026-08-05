import {Channel, invoke} from '@tauri-apps/api/core';

import type {AnswerService} from './answer-service';
import type {AnswerEvent, AnswerRequest} from './answer.types';

export class TauriAnswerService implements AnswerService {
  async *stream(request: AnswerRequest, signal: AbortSignal): AsyncIterable<AnswerEvent> {
    const queued: AnswerEvent[] = [];
    let wake: (() => void) | undefined;
    let completed = false;
    let failure: unknown;
    const channel = new Channel<AnswerEvent>((event) => {
      queued.push(event);
      wake?.();
      wake = undefined;
    });
    const cancel = () => {
      void invoke('cancel_answer', {requestId: request.requestId});
      wake?.();
      wake = undefined;
    };
    signal.addEventListener('abort', cancel, {once: true});
    void invoke<void>('start_answer', {request, onEvent: channel})
      .catch((error: unknown) => {
        failure = error;
      })
      .finally(() => {
        completed = true;
        wake?.();
        wake = undefined;
      });

    try {
      while (!completed || queued.length > 0) {
        if (signal.aborted) return;
        if (queued.length === 0) {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
          continue;
        }
        yield queued.shift()!;
      }
      if (failure) {
        throw failure instanceof Error ? failure : new Error(String(failure));
      }
    } finally {
      signal.removeEventListener('abort', cancel);
      if (!completed) cancel();
    }
  }
}
