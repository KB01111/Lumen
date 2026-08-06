import type {SessionReliefReport} from './session-relief.schema';

export interface SessionReliefService {
  collect(): Promise<SessionReliefReport>;
}

export class SessionReliefServiceError extends Error {
  constructor(readonly code: 'unavailable' | 'collection-failed' | 'incompatible-report', message: string) {
    super(message);
    this.name = 'SessionReliefServiceError';
  }
}
