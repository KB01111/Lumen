import type {SessionReliefService} from './session-relief-service';
import {TauriSessionReliefService} from './tauri-session-relief-service';
import {UnavailableSessionReliefService} from './unavailable-session-relief-service';

export function createSessionReliefService(): SessionReliefService {
  const native = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  return native ? new TauriSessionReliefService() : new UnavailableSessionReliefService();
}

export const defaultSessionReliefService = createSessionReliefService();
