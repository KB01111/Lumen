import {describe, expect, it, vi} from 'vitest';

import {createSafeSummary} from '../../features/session-relief/session-relief-format';
import {createSessionReliefService} from './default-session-relief-service';
import {makeSessionReliefReport} from './session-relief.fixture';
import {SessionReliefServiceError} from './session-relief-service';
import {TauriSessionReliefService} from './tauri-session-relief-service';
import {UnavailableSessionReliefService} from './unavailable-session-relief-service';

describe('Session Relief service boundary', () => {
  it('invokes the native command without a payload', async () => {
    const invoke = vi.fn(async () => makeSessionReliefReport());
    await expect(new TauriSessionReliefService(invoke).collect()).resolves.toMatchObject({schemaVersion: 1});
    expect(invoke).toHaveBeenCalledWith('session_relief_snapshot');
  });

  it('rejects an incompatible native report', async () => {
    const invoke = vi.fn(async () => ({...makeSessionReliefReport(), schemaVersion: 2}));
    await expect(new TauriSessionReliefService(invoke).collect()).rejects.toMatchObject({code: 'incompatible-report'} satisfies Partial<SessionReliefServiceError>);
  });

  it('selects the native adapter only in a Tauri runtime', () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {configurable: true, value: {}});
    expect(createSessionReliefService()).toBeInstanceOf(TauriSessionReliefService);
    delete (window as Window & {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
    expect(createSessionReliefService()).toBeInstanceOf(UnavailableSessionReliefService);
  });

  it('constructs a summary that excludes local-only tree and PID data', () => {
    const summary = createSafeSummary(makeSessionReliefReport());
    for (const excluded of ['trees', 'rootPid', 'pid', 'parentPid', '4100', 'cline.exe', 'node.exe', 'evidence']) {
      expect(summary).not.toContain(excluded);
    }
    for (const included of ['capturedAt', 'system', 'families', 'findings', 'coverage', 'warnings']) {
      expect(summary).toContain(included);
    }
  });
});
