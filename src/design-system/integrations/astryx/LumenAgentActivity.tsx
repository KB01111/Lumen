import {ChatMessage, ChatToolCalls, type ChatToolCallStatus} from '@astryxdesign/core/Chat';

import {AgentActivityHistory, agentActivityLabels, type AgentActivityEntry, type AgentActivityPhase} from './AgentActivityHistory';
import './styles.css';

export interface LumenAgentActivityProps {
  phase: AgentActivityPhase;
  entries: readonly AgentActivityEntry[];
}

const progress: Record<Exclude<AgentActivityPhase, 'idle' | 'stopped'>, ChatToolCallStatus> = {
  starting: 'pending',
  running: 'running',
  approval: 'pending',
  completed: 'complete',
  stopping: 'pending',
  error: 'error',
};

export function LumenAgentActivity({phase, entries}: LumenAgentActivityProps) {
  if (phase === 'idle' && entries.length === 0) return null;

  return (
    <section aria-label="Agent execution progress" className="lumen-agent-activity min-w-0" data-astryx-theme="lumen-agent">
      {phase === 'stopped' || phase === 'idle' ? (
        <AgentActivityHistory phase={phase} entries={entries} />
      ) : (
        <ChatMessage sender="assistant" name="Agent activity" density="compact">
          <ChatToolCalls calls={[{
            key: 'computer-use-session',
            name: 'Computer Use session',
            target: agentActivityLabels[phase],
            status: progress[phase],
          }]} />
          <AgentActivityHistory entries={entries} />
        </ChatMessage>
      )}
    </section>
  );
}
