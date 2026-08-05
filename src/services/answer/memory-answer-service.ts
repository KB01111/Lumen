import type {AnswerService} from './answer-service';
import type {AnswerEvent, AnswerRequest} from './answer.types';

interface PendingRead {
  resolve: (result: IteratorResult<AnswerEvent>) => void;
}

interface MemoryStream {
  query: string;
  queue: AnswerEvent[];
  readers: PendingRead[];
  closed: boolean;
}

export interface RecordedAnswerRequest {
  request: AnswerRequest;
  signal: AbortSignal;
}

function closesStream(event: AnswerEvent): boolean {
  return event.type === 'completed' || event.type === 'cancelled' || event.type === 'failed';
}

export class MemoryAnswerService implements AnswerService {
  readonly requests: RecordedAnswerRequest[] = [];
  private readonly streams: MemoryStream[] = [];

  async *stream(request: AnswerRequest, signal: AbortSignal): AsyncIterable<AnswerEvent> {
    const stream: MemoryStream = {
      query: request.query,
      queue: [],
      readers: [],
      closed: false,
    };
    this.requests.push({request, signal});
    this.streams.push(stream);

    const close = () => {
      stream.closed = true;
      for (const reader of stream.readers.splice(0)) {
        reader.resolve({done: true, value: undefined});
      }
    };
    signal.addEventListener('abort', close, {once: true});

    try {
      while (!stream.closed || stream.queue.length > 0) {
        const next = stream.queue.shift() ?? await new Promise<AnswerEvent | undefined>((resolve) => {
          if (stream.closed) {
            resolve(undefined);
            return;
          }
          stream.readers.push({
            resolve: (result) => resolve(result.done ? undefined : result.value),
          });
        });
        if (!next) {
          return;
        }
        yield next;
        if (closesStream(next)) {
          close();
        }
      }
    } finally {
      signal.removeEventListener('abort', close);
      close();
    }
  }

  async emit(query: string, event: AnswerEvent): Promise<void> {
    const stream = [...this.streams].reverse().find((candidate) => candidate.query === query);
    if (!stream || stream.closed) {
      return;
    }

    const reader = stream.readers.shift();
    if (reader) {
      reader.resolve({done: false, value: event});
    } else {
      stream.queue.push(event);
    }
    await Promise.resolve();
  }
}

