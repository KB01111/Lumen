import {LumenText} from '../../primitives/LumenText';

export type AgentActivityPhase = 'idle' | 'starting' | 'running' | 'approval' | 'completed' | 'stopping' | 'stopped' | 'error';
export interface AgentActivityEntry {id: number; label: string; tone: 'neutral' | 'accent' | 'success';}
export interface AgentActivityHistoryProps {
  entries: readonly AgentActivityEntry[];
  phase?: AgentActivityPhase;
}

export const agentActivityLabels: Record<AgentActivityPhase, string> = {
  idle: 'Ready',
  starting: 'Starting',
  running: 'Working',
  approval: 'Waiting for your approval',
  completed: 'Completed',
  stopping: 'Stopping',
  stopped: 'Stopped',
  error: 'Unavailable',
};

// This fallback deliberately imports no Astryx code or CSS.
export function AgentActivityHistory({entries, phase}: AgentActivityHistoryProps) {
  return (
    <>
      {phase ? <LumenText as="p" role="status" variant="meta" weight="medium">{agentActivityLabels[phase]}</LumenText> : null}
      {entries.length > 0 ? (
        <ul aria-label="Computer Use activity" className="m-0 grid min-w-0 list-none gap-2 p-0">
          {entries.map((entry) => (
            <li key={entry.id} className="flex min-w-0 items-start gap-3">
              <span aria-hidden="true" className={['mt-1.5 size-1.5 shrink-0 rounded-pill', entry.tone === 'accent' ? 'bg-accent' : entry.tone === 'success' ? 'bg-success' : 'bg-text-tertiary'].join(' ')} />
              <LumenText tone="secondary" variant="meta">{entry.label}</LumenText>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
