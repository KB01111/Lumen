import type {AnswerService} from './answer-service';
import type {AnswerEvent, AnswerRequest} from './answer.types';

export class UnavailableAnswerService implements AnswerService {
  async *stream(_request: AnswerRequest, signal: AbortSignal): AsyncIterable<AnswerEvent> {
    if (signal.aborted) {
      yield {type: 'cancelled'};
      return;
    }
    yield {
      type: 'failed',
      code: 'runtime-unavailable',
      message: 'The answer runtime is not ready. Local search is still available.',
    };
  }
}

