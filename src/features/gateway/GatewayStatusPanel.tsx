import {GatewayIcon} from '../../design-system/icons/lumen-icons';
import {LumenUiIcon, type LumenUiIconName} from '../../design-system/icons/LumenUiIcon';
import {LumenButton} from '../../design-system/primitives/LumenButton';
import {LumenText} from '../../design-system/primitives/LumenText';
import type {GatewayState} from './gateway.types';

const stateCopy: Record<GatewayState, {label: string; description: string; tone: 'success' | 'warning' | 'info'}> = {
  starting: {label: 'Starting', description: 'The local gateway is establishing provider routes.', tone: 'info'},
  restarting: {label: 'Restarting', description: 'Local search remains available while routes restart.', tone: 'info'},
  ready: {label: 'Ready', description: 'The checksum-pinned AgentGateway sidecar is running.', tone: 'success'},
  unavailable: {label: 'Unavailable', description: 'AI routes are unavailable; local search is unaffected.', tone: 'warning'},
};

export function GatewayStatusPanel({state, onRestart}: {state: GatewayState; onRestart(): void}) {
  const copy = stateCopy[state];
  const stateIcon: LumenUiIconName = copy.tone === 'success' ? 'success' : copy.tone === 'warning' ? 'error' : 'refresh';
  return (
    <section aria-label="AgentGateway status" className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-5 rounded-surface border border-border-subtle bg-surface-inset p-6" data-testid={`gateway-${state}`}>
      <span aria-hidden="true" className="grid size-12 place-items-center rounded-control bg-accent/10 text-accent"><GatewayIcon size={26} /></span>
      <div className="grid min-w-0 gap-1">
        <div aria-label={copy.label} className="flex items-center gap-2" role="status">
          <LumenUiIcon name={stateIcon} size="small" />
          <LumenText weight="semibold">{copy.label}</LumenText>
        </div>
        <LumenText tone="tertiary" variant="meta">{copy.description}</LumenText>
      </div>
      <LumenButton aria-label="Restart AgentGateway" size="small" onPress={onRestart}>Restart</LumenButton>
    </section>
  );
}
