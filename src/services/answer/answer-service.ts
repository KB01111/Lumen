import type {AnswerEvent, AnswerRequest} from './answer.types';

export interface AnswerService {
  stream(request: AnswerRequest, signal: AbortSignal): AsyncIterable<AnswerEvent>;
}

