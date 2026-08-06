import {useRef, useState} from 'react';

import {ArrowClockwiseIcon, CopyIcon, StopIcon} from '@phosphor-icons/react';
import * as stylex from '@stylexjs/stylex';

import {LumenButton} from '../../design-system/primitives/LumenButton';
import {LumenText} from '../../design-system/primitives/LumenText';
import {tokens} from '../../design-system/tokens.stylex';
import type {RuntimeMode} from '../../services/answer/answer.types';
import type {AnswerState} from './useAnswerController';
import {RuntimeModeSwitch} from './RuntimeModeSwitch';

const styles = stylex.create({
  root: {
    display: 'grid',
    gap: tokens.space5,
    paddingBlock: tokens.space5,
    paddingInline: tokens.space8,
    backgroundColor: tokens.colorMaterialTint,
    borderBottomColor: tokens.colorBorderSubtle,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.space6,
  },
  heading: {
    minWidth: 0,
    display: 'flex',
    alignItems: 'baseline',
    gap: tokens.space4,
  },
  answer: {
    maxHeight: '112px',
    margin: 0,
    overflowY: 'auto',
    color: tokens.colorTextPrimary,
    fontFamily: tokens.fontFamilyText,
    fontSize: tokens.fontSizeBody,
    lineHeight: tokens.lineHeightRelaxed,
    whiteSpace: 'pre-wrap',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.space5,
  },
  citations: {
    minWidth: 0,
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.space3,
  },
  citation: {
    minHeight: '26px',
    paddingInline: tokens.space4,
    color: tokens.colorAccent,
    backgroundColor: tokens.colorAccentMuted,
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusRound,
    outlineColor: 'transparent',
    outlineOffset: '2px',
    outlineStyle: 'solid',
    outlineWidth: '2px',
    fontFamily: tokens.fontFamilyText,
    fontSize: tokens.fontSizeCaption,
    cursor: 'default',
    ':focus-visible': {outlineColor: tokens.colorFocus},
  },
  actions: {
    display: 'flex',
    flexShrink: 0,
    gap: tokens.space2,
  },
});

function statusLabel(answer: AnswerState) {
  if (answer.phase === 'waiting') return 'Settling query';
  if (answer.phase === 'streaming') return 'Answering';
  if (answer.phase === 'error') return answer.error ?? 'Answer unavailable';
  if (answer.phase === 'cancelled') return 'Stopped';
  if (answer.provider || answer.model) {
    return [answer.provider, answer.model, answer.route].filter(Boolean).join(' · ');
  }
  return 'Local search stays available';
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

export interface AnswerPanelProps {
  answer: AnswerState;
  mode: RuntimeMode;
  onModeChange(mode: RuntimeMode): Promise<void> | void;
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
  const [modeError, setModeError] = useState('');
  const [modeBusy, setModeBusy] = useState(false);
  const modeChangeInFlight = useRef(false);
  const canStop = answer.phase === 'waiting' || answer.phase === 'streaming';
  const hasAnswer = answer.text.length > 0;

  const copyAnswer = async () => {
    await navigator.clipboard.writeText(answer.text);
    setCopied(true);
  };
  const changeMode = async (nextMode: RuntimeMode) => {
    if (modeChangeInFlight.current) return;
    modeChangeInFlight.current = true;
    setModeBusy(true);
    setModeError('');
    try {
      await onModeChange(nextMode);
    } catch (error) {
      setModeError(error instanceof Error ? error.message : 'The answer runtime could not be changed.');
    } finally {
      modeChangeInFlight.current = false;
      setModeBusy(false);
    }
  };

  return (
    <section aria-label="AI answer" {...stylex.props(styles.root)}>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.heading)}>
          <LumenText variant="meta" weight="medium">AI answer</LumenText>
          <LumenText tone="tertiary" variant="caption">{statusLabel(answer)}</LumenText>
        </div>
        <RuntimeModeSwitch isDisabled={modeBusy} mode={mode} onChange={(nextMode) => void changeMode(nextMode)} />
      </header>
      {modeError ? <p role="alert" aria-live="assertive" {...stylex.props(styles.answer)}>{modeError}</p> : null}
      {answer.phase !== 'idle' ? (
        <p aria-live="polite" {...stylex.props(styles.answer)}>
          {hasAnswer ? answer.text : answer.phase === 'waiting' ? 'Waiting for the query to settle…' : 'Preparing an answer…'}
        </p>
      ) : null}
      <footer {...stylex.props(styles.footer)}>
        <div aria-label="Answer sources" {...stylex.props(styles.citations)}>
          {answer.citations.map((citation) => {
            const label = citationLabel(citation.label, citation.page, citation.timestampSeconds);
            return (
              <button
                key={`${citation.fileId}-${citation.page ?? citation.timestampSeconds ?? 'file'}`}
                aria-label={`Open ${label}`}
                type="button"
                onClick={() => onOpenCitation(citation.fileId)}
                {...stylex.props(styles.citation)}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div {...stylex.props(styles.actions)}>
          {canStop ? (
            <LumenButton aria-label="Stop answer" size="small" variant="quiet" onPress={onStop}>
              <StopIcon aria-hidden="true" size={14} /> Stop
            </LumenButton>
          ) : (
            <LumenButton aria-label="Retry answer" size="small" variant="quiet" onPress={onRetry}>
              <ArrowClockwiseIcon aria-hidden="true" size={14} /> Retry
            </LumenButton>
          )}
          <LumenButton aria-label="Copy answer" isDisabled={!hasAnswer} size="small" variant="quiet" onPress={() => void copyAnswer()}>
            <CopyIcon aria-hidden="true" size={14} /> {copied ? 'Copied' : 'Copy'}
          </LumenButton>
        </div>
      </footer>
    </section>
  );
}

