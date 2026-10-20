import {lazy, Suspense} from 'react';

import {useDocumentVisible} from '../../app/AppProviders';
import {AgentActivityHistory} from '../../design-system/integrations/astryx/AgentActivityHistory';
import {useLauncherStore} from '../launcher/launcher.store';
import type {ComputerUseState} from './useComputerUseController';

const EnhancedActivity = lazy(async () => {
  try {
    const module = await import('../../design-system/integrations/astryx/LumenAgentActivity');
    return {default: module.LumenAgentActivity};
  } catch {
    // Presentation loading must never remove the existing task history or Stop.
    return {default: AgentActivityHistory};
  }
});

export function AgentActivity({phase, activity}: Pick<ComputerUseState, 'phase' | 'activity'>) {
  const visible = useLauncherStore((state) => state.visible);
  const documentVisible = useDocumentVisible();
  const history = <AgentActivityHistory entries={activity} />;
  if (!visible || !documentVisible) return history;

  return (
    <Suspense fallback={history}>
      <EnhancedActivity entries={activity} phase={phase} />
    </Suspense>
  );
}
