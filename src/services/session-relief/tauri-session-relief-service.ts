import {invoke as tauriInvoke} from '@tauri-apps/api/core';

import {sessionReliefReportSchema, type SessionReliefReport} from './session-relief.schema';
import {SessionReliefServiceError, type SessionReliefService} from './session-relief-service';

type InvokeCommand = (command: string) => Promise<unknown>;

export class TauriSessionReliefService implements SessionReliefService {
  constructor(private readonly invoke: InvokeCommand = tauriInvoke) {}

  async collect(): Promise<SessionReliefReport> {
    let response: unknown;
    try {
      response = await this.invoke('session_relief_snapshot');
    } catch {
      throw new SessionReliefServiceError('collection-failed', 'Lumen could not complete the local session analysis.');
    }
    const parsed = sessionReliefReportSchema.safeParse(response);
    if (!parsed.success) {
      throw new SessionReliefServiceError('incompatible-report', 'The Lumen desktop app returned an incompatible Session Relief report.');
    }
    return parsed.data;
  }
}
