import {SessionReliefServiceError, type SessionReliefService} from './session-relief-service';

export class UnavailableSessionReliefService implements SessionReliefService {
  async collect(): Promise<never> {
    throw new SessionReliefServiceError('unavailable', 'Session Relief is available in the Lumen desktop app.');
  }
}
