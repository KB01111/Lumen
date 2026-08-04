import {useCallback, useEffect, useRef, useState} from 'react';

import type {AnswerService} from '../../services/answer/answer-service';
import type {
  AnswerCitation,
  AnswerEvent,
  AnswerUsage,
  RuntimeMode,
} from '../../services/answer/answer.types';

export type AnswerPhase = 'idle' | 'waiting' | 'streaming' | 'completed' | 'cancelled' | 'error';

export interface AnswerState {
  phase: AnswerPhase;
  text: string;
  citations: readonly AnswerCitation[];
  usage?: AnswerUsage;
  provider?: string;
  model?: string;
  route?: string;
  error?: string;
}

export interface AnswerController extends AnswerState {
  stop(): void;
  retry(): void;
}

interface AnswerControllerOptions {
  query: string;
  mode: RuntimeMode;
  cloudConsent?: boolean;
  delayMs?: number;
  restartKey?: number;
}

const idleState: AnswerState = {
  phase: 'idle',
  text: '',
  citations: [],
};

function applyEvent(state: AnswerState, event: AnswerEvent): AnswerState {
  switch (event.type) {
    case 'started':
      return {...state, phase: 'streaming', provider: event.provider, model: event.model, route: event.route};
    case 'citation':
      return state.citations.some((citation) =>
        citation.fileId === event.citation.fileId
        && citation.page === event.citation.page
        && citation.timestampSeconds === event.citation.timestampSeconds
      ) ? state : {...state, citations: [...state.citations, event.citation]};
    case 'delta':
      return {...state, text: state.text + event.text};
    case 'usage':
      return {...state, usage: event.usage};
    case 'completed':
      return {
        ...state,
        phase: 'completed',
        provider: event.provider,
        model: event.model,
        route: event.route,
      };
    case 'cancelled':
      return {...state, phase: 'cancelled'};
    case 'failed':
      return {...state, phase: 'error', error: event.message};
  }
}

export function useAnswerController(
  service: AnswerService,
  {query, mode, cloudConsent = false, delayMs = 350, restartKey = 0}: AnswerControllerOptions,
): AnswerController {
  const [state, setState] = useState<AnswerState>(idleState);
  const [retryRevision, setRetryRevision] = useState(0);
  const sequence = useRef(0);
  const activeAbort = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    sequence.current += 1;
    activeAbort.current?.abort();
    setState((current) => {
      if (current.phase === 'idle' || current.phase === 'cancelled') return current;
      return {...current, phase: 'cancelled'};
    });
  }, []);

  const retry = useCallback(() => {
    setRetryRevision((current) => current + 1);
  }, []);

  useEffect(() => {
    const normalizedQuery = query.trim();
    const currentSequence = ++sequence.current;

    if (!normalizedQuery) {
      setState(idleState);
      return;
    }

    const abortController = new AbortController();
    activeAbort.current = abortController;
    setState({phase: 'waiting', text: '', citations: []});

    const timeout = window.setTimeout(() => {
      if (abortController.signal.aborted || sequence.current !== currentSequence) {
        return;
      }

      setState({phase: 'streaming', text: '', citations: []});
      void (async () => {
        try {
          const events = service.stream({
            requestId: currentSequence,
            query: normalizedQuery,
            mode,
            cloudConsent,
          }, abortController.signal);
          for await (const event of events) {
            if (abortController.signal.aborted || sequence.current !== currentSequence) {
              return;
            }
            setState((current) => applyEvent(current, event));
          }
        } catch (error) {
          if (!abortController.signal.aborted && sequence.current === currentSequence) {
            setState((current) => ({
              ...current,
              phase: 'error',
              error: error instanceof Error ? error.message : 'Answer generation failed',
            }));
          }
        }
      })();
    }, delayMs);

    return () => {
      window.clearTimeout(timeout);
      abortController.abort();
      if (activeAbort.current === abortController) {
        activeAbort.current = null;
      }
    };
  }, [cloudConsent, delayMs, mode, query, restartKey, retryRevision, service]);

  return {...state, retry, stop};
}
