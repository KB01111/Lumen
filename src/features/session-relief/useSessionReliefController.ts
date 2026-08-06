import {useCallback, useEffect, useRef, useState} from 'react';

import type {SessionReliefReport} from '../../services/session-relief/session-relief.schema';
import {SessionReliefServiceError, type SessionReliefService} from '../../services/session-relief/session-relief-service';

export type SessionReliefStatus = 'idle' | 'collecting' | 'ready' | 'partial' | 'error';

export interface SessionReliefController {
  status: SessionReliefStatus;
  report: SessionReliefReport | null;
  error: string | null;
  analyze(): Promise<void>;
}

function messageFor(error: unknown): string {
  if (error instanceof SessionReliefServiceError) return error.message;
  return 'Lumen could not complete the local session analysis.';
}

function reportStatus(report: SessionReliefReport): Extract<SessionReliefStatus, 'ready' | 'partial'> {
  return report.warnings.length > 0 || report.coverage.skippedProcesses > 0 ? 'partial' : 'ready';
}

export function useSessionReliefController(service: SessionReliefService): SessionReliefController {
  const [status, setStatus] = useState<SessionReliefStatus>('idle');
  const [report, setReport] = useState<SessionReliefReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  const analyze = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setStatus('collecting');
    setError(null);
    try {
      const nextReport = await service.collect();
      if (!aliveRef.current || requestId !== requestIdRef.current) return;
      setReport(nextReport);
      setStatus(reportStatus(nextReport));
    } catch (reason) {
      if (!aliveRef.current || requestId !== requestIdRef.current) return;
      setError(messageFor(reason));
      setStatus('error');
    }
  }, [service]);

  return {status, report, error, analyze};
}
