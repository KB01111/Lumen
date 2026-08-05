import {useCallback, useEffect, useRef, useState} from 'react';

import type {ComputerUseService} from '../../services/computer-use/computer-use-service';
import type {
  ComputerUseEvent,
  ComputerUseHealth,
  ComputerUseModel,
} from '../../services/computer-use/computer-use.types';

export type ComputerUsePhase =
  | 'idle'
  | 'starting'
  | 'running'
  | 'approval'
  | 'completed'
  | 'cancelled'
  | 'error';

export interface ComputerUseActivity {
  id: number;
  label: string;
  tone: 'neutral' | 'accent' | 'success';
}

export interface ComputerUseState {
  phase: ComputerUsePhase;
  health?: ComputerUseHealth;
  task?: string;
  taskId?: number;
  model?: string;
  browser?: string;
  currentUrl?: string;
  reasoning?: string;
  summary?: string;
  error?: string;
  approval?: {id: string; explanation: string};
  activity: readonly ComputerUseActivity[];
}

export interface ComputerUseController extends ComputerUseState {
  refreshHealth(): Promise<void>;
  start(task: string): Promise<void>;
  approve(): Promise<void>;
  deny(): Promise<void>;
  stop(): void;
}

interface ComputerUseOptions {
  model: ComputerUseModel;
  initialUrl: string;
  cloudConsent: boolean;
}

const initialState: ComputerUseState = {phase: 'idle', activity: []};

function createTaskId() {
  const words = new Uint32Array(2);
  globalThis.crypto.getRandomValues(words);
  return (words[0] & 0x1f_ffff) * 0x1_0000_0000 + words[1];
}

function appendActivity(
  activity: readonly ComputerUseActivity[],
  label: string,
  tone: ComputerUseActivity['tone'] = 'neutral',
) {
  const id = (activity[activity.length - 1]?.id ?? 0) + 1;
  return [...activity, {id, label, tone}].slice(-8);
}

function actionLabel(action: string) {
  return action.replace(/_/g, ' ').replace(/\b\w/g, (value: string) => value.toUpperCase());
}

function applyEvent(state: ComputerUseState, event: ComputerUseEvent): ComputerUseState {
  switch (event.type) {
    case 'started':
      return {
        ...state,
        phase: 'running',
        model: event.model,
        browser: event.browser,
        activity: appendActivity(state.activity, `${event.browser} session started`, 'accent'),
      };
    case 'reasoning':
      return {...state, reasoning: event.text};
    case 'action':
      return {
        ...state,
        activity: appendActivity(state.activity, actionLabel(event.action)),
      };
    case 'observation':
      return {...state, currentUrl: event.url};
    case 'approvalRequired':
      return {
        ...state,
        phase: 'approval',
        approval: {id: event.approvalId, explanation: event.explanation},
        activity: appendActivity(state.activity, 'Waiting for your approval', 'accent'),
      };
    case 'approvalResolved':
      return event.approved
        ? {
            ...state,
            phase: 'running',
            approval: undefined,
            activity: appendActivity(state.activity, 'Sensitive action approved', 'success'),
          }
        : {
            ...state,
            phase: 'cancelled',
            approval: undefined,
            activity: appendActivity(state.activity, 'Sensitive action denied'),
          };
    case 'completed':
      return {
        ...state,
        phase: 'completed',
        summary: event.summary,
        approval: undefined,
        activity: appendActivity(state.activity, 'Task completed', 'success'),
      };
    case 'cancelled':
      return {...state, phase: 'cancelled', approval: undefined};
    case 'failed':
      return {...state, phase: 'error', error: event.message, approval: undefined};
  }
}

export function useComputerUseController(
  service: ComputerUseService,
  {model, initialUrl, cloudConsent}: ComputerUseOptions,
): ComputerUseController {
  const [state, setState] = useState<ComputerUseState>(initialState);
  const activeAbort = useRef<AbortController | null>(null);
  const respondingApproval = useRef<string | null>(null);

  const refreshHealth = useCallback(async () => {
    try {
      const health = await service.health();
      setState((current) => ({...current, health}));
    } catch (error) {
      setState((current) => ({
        ...current,
        health: {
          state: 'unavailable',
          mode: 'missing',
          browser: 'Microsoft Edge',
          credentialConfigured: false,
          detail: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  }, [service]);

  useEffect(() => {
    void refreshHealth();
    return () => activeAbort.current?.abort();
  }, [refreshHealth]);

  const start = useCallback(async (task: string) => {
    const normalizedTask = task.trim();
    if (!normalizedTask || activeAbort.current) return;
    const taskId = createTaskId();
    const abortController = new AbortController();
    activeAbort.current = abortController;
    setState((current) => ({
      phase: 'starting',
      health: current.health,
      task: normalizedTask,
      taskId,
      activity: [],
    }));
    try {
      for await (const event of service.stream({
        taskId,
        task: normalizedTask,
        model,
        initialUrl,
        cloudConsent,
      }, abortController.signal)) {
        if (abortController.signal.aborted) return;
        setState((current) => applyEvent(current, event));
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        setState((current) => ({
          ...current,
          phase: 'error',
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    } finally {
      if (activeAbort.current === abortController) activeAbort.current = null;
      void refreshHealth();
    }
  }, [cloudConsent, initialUrl, model, refreshHealth, service]);

  const respond = useCallback(async (approved: boolean) => {
    const {approval, taskId} = state;
    if (!approval || taskId === undefined) return;
    const responseId = `${taskId}:${approval.id}`;
    if (respondingApproval.current === responseId) return;
    respondingApproval.current = responseId;
    try {
      await service.respond(taskId, approval.id, approved);
      setState((current) => approved ? {
        ...current,
        phase: 'running',
        approval: undefined,
      } : {
        ...current,
        phase: 'cancelled',
        approval: undefined,
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        phase: 'error',
        error: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      if (respondingApproval.current === responseId) respondingApproval.current = null;
    }
  }, [service, state]);

  const stop = useCallback(() => {
    activeAbort.current?.abort();
    setState((current) => ({...current, phase: 'cancelled', approval: undefined}));
  }, []);

  return {
    ...state,
    refreshHealth,
    start,
    approve: () => respond(true),
    deny: () => respond(false),
    stop,
  };
}
