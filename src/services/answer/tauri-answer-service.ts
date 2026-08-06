import {Channel, invoke} from '@tauri-apps/api/core';

import type {AnswerService} from './answer-service';
import {answerEventSchema, answerRequestSchema, type AnswerEvent, type AnswerRequest} from './answer.types';

function terminal(event: AnswerEvent) {
  return event.type === 'completed' || event.type === 'cancelled' || event.type === 'failed';
}

export class TauriAnswerService implements AnswerService {
  async *stream(request: AnswerRequest, signal: AbortSignal): AsyncIterable<AnswerEvent> {
    const parsedRequest = answerRequestSchema.parse(request);
    const queued: AnswerEvent[] = [];
    let wake: (() => void) | undefined;
    let finished = false;
    let workerTerminal = false;
    let startFailure: unknown;
    let cancellation: Promise<void> | undefined;
    const channel = new Channel<unknown>((payload) => {
      try {
        const event = answerEventSchema.parse(payload);
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
    const startup = invoke<void>('start_answer', {request: parsedRequest, onEvent: channel})
      .catch((error: unknown) => {
        startFailure = error;
        finished = true;
        wake?.();
        wake = undefined;
      });
    const cancel = () => {
      cancellation ??= invoke<void>('cancel_answer', {requestId: parsedRequest.requestId})
        .catch(() => undefined);
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
      void startup;
      await cancellation;
    }
  }
}
