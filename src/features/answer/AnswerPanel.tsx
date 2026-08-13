import {useEffect, useState} from 'react';

import {LumenUiIcon} from '../../design-system/icons/LumenUiIcon';
import type {RuntimeMode} from '../../services/answer/answer.types';
import type {AnswerState} from './useAnswerController';
import {RuntimeModeSwitch} from './RuntimeModeSwitch';

function statusLabel(answer: AnswerState) {
  if (answer.phase === 'idle') return 'Ready when submitted';
  if (answer.phase === 'waiting') return 'Settling query';
  if (answer.phase === 'streaming') return 'Answering';
  if (answer.phase === 'error') return 'Answer unavailable';
  if (answer.phase === 'cancelled') return 'Stopped';
  return 'Ready';
}

function citationLabel(label: string, page?: number, timestampSeconds?: number) {
  if (page !== undefined) return `${label}, page ${page}`;
  if (timestampSeconds !== undefined) {
    const minutes = Math.floor(timestampSeconds / 60);
    const seconds = Math.floor(timestampSeconds % 60).toString().padStart(2, '0');
    return `${label}, ${minutes}:${seconds}`;
  }
  return label;
}

const quietButtonClass = 'inline-flex min-h-8 items-center justify-center gap-1.5 rounded-control px-2.5 font-sans text-xs text-[color:var(--einui-command-muted-text)] outline-none transition-colors duration-[90ms] hover:bg-[var(--einui-command-row-hover)] hover:text-[color:var(--einui-command-text)] focus-visible:ring-2 focus-visible:ring-[var(--lumen-focus)] disabled:cursor-not-allowed disabled:opacity-55';

export interface AnswerPanelProps {
  answer: AnswerState;
  mode: RuntimeMode;
  onModeChange(mode: RuntimeMode): void;
  onOpenCitation(fileId: string): void;
  onRetry(): void;
  onStop(): void;
}

export function AnswerPanel({
  answer,
  mode,
  onModeChange,
  onOpenCitation,
  onRetry,
  onStop,
}: AnswerPanelProps) {
  const [copied, setCopied] = useState(false);
  const canStop = answer.phase === 'waiting' || answer.phase === 'streaming';
  const canRetry = answer.phase === 'error' || answer.phase === 'cancelled' || answer.phase === 'completed';
  const hasAnswer = answer.text.length > 0;
  const runtimeDetail = [answer.provider, answer.model, answer.route].filter(Boolean).join(' · ');

  const copyAnswer = async () => {
    await navigator.clipboard.writeText(answer.text);
    setCopied(true);
  };

  useEffect(() => {
    setCopied(false);
  }, [answer.text]);

  return (
    <section aria-label="AI answer" className="grid min-h-[150px] gap-3 border-b border-[color:var(--einui-command-divider)] px-4 py-3">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="font-sans text-xs font-medium text-[color:var(--einui-command-text)]">AI answer</span>
          <span className="truncate font-sans text-[0.6875rem] text-[color:var(--einui-command-muted-text)]">{statusLabel(answer)}</span>
        </div>
        <RuntimeModeSwitch mode={mode} onChange={onModeChange} />
      </header>
      <div
        aria-live="polite"
        className="min-h-12 max-h-28 overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-[color:var(--einui-command-text)]"
        data-testid="answer-region"
      >
        {answer.phase === 'idle' ? null : hasAnswer
          ? answer.text
          : answer.phase === 'waiting'
            ? 'Waiting for the query to settle…'
            : answer.phase === 'error'
              ? answer.error ?? 'The answer could not be completed. You can retry without interrupting local search.'
              : 'Preparing an answer…'}
      </div>
      <footer className="flex items-center justify-between gap-3">
        <div aria-label="Answer sources" className="flex min-w-0 flex-wrap gap-1.5">
          {answer.citations.map((citation) => {
            const label = citationLabel(citation.label, citation.page, citation.timestampSeconds);
            return (
              <button
                key={`${citation.fileId}-${citation.page ?? citation.timestampSeconds ?? 'file'}`}
                aria-label={`Open ${label}`}
                className="min-h-7 rounded-pill border border-[color:var(--einui-command-divider)] bg-[var(--einui-command-row)] px-2 font-sans text-[0.6875rem] text-accent outline-none transition-colors duration-[90ms] hover:bg-[var(--einui-command-row-hover)] focus-visible:ring-2 focus-visible:ring-focus"
                type="button"
                onClick={() => onOpenCitation(citation.fileId)}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {runtimeDetail ? (
            <details className="relative">
              <summary className={`${quietButtonClass} cursor-default list-none [&::-webkit-details-marker]:hidden`}>Runtime details</summary>
              <div className="absolute bottom-full right-0 z-30 mb-1 w-max max-w-64 rounded-control border border-[color:var(--einui-command-divider)] bg-[var(--lumen-surface-raised)] px-2 py-1.5 font-sans text-[0.6875rem] text-text-secondary shadow-control">
                {runtimeDetail}
              </div>
            </details>
          ) : null}
          {canStop ? (
            <button aria-label="Stop answer" className={quietButtonClass} type="button" onClick={onStop}><LumenUiIcon name="stop" size="small" /> Stop</button>
          ) : canRetry ? (
            <button aria-label="Retry answer" className={quietButtonClass} type="button" onClick={onRetry}><LumenUiIcon name="retry" size="small" /> Retry</button>
          ) : null}
          {hasAnswer ? (
            <button aria-label="Copy answer" className={quietButtonClass} type="button" onClick={() => void copyAnswer()}><LumenUiIcon name="copy" size="small" /> {copied ? 'Copied' : 'Copy'}</button>
          ) : null}
        </div>
      </footer>
    </section>
  );
}
