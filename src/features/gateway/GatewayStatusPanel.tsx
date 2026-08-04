import {ArrowClockwiseIcon, CheckCircleIcon, WarningCircleIcon} from '@phosphor-icons/react';
import * as stylex from '@stylexjs/stylex';

import {GatewayIcon} from '../../design-system/icons/lumen-icons';
import {LumenButton} from '../../design-system/primitives/LumenButton';
import {LumenText} from '../../design-system/primitives/LumenText';
import {tokens} from '../../design-system/tokens.stylex';
import type {GatewayState} from './gateway.types';

const styles = stylex.create({
  panel: {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: tokens.space8,
    padding: tokens.space10,
    backgroundColor: tokens.colorMaterialInset,
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusLarge,
    boxShadow: tokens.shadowInsetTop,
  },
  icon: {
    width: '48px',
    height: '48px',
    display: 'grid',
    placeItems: 'center',
    color: tokens.colorAccent,
    backgroundColor: tokens.colorAccentMuted,
    borderRadius: tokens.radiusLarge,
  },
  text: {display: 'grid', gap: tokens.space2},
  stateLine: {display: 'flex', alignItems: 'center', gap: tokens.space4},
});

const stateCopy: Record<GatewayState, {label: string; description: string; tone: 'success' | 'warning' | 'info'}> = {
  starting: {label: 'Starting', description: 'The local gateway is establishing provider routes.', tone: 'info'},
  restarting: {label: 'Restarting', description: 'Local search remains available while routes restart.', tone: 'info'},
  ready: {label: 'Ready', description: 'The checksum-pinned AgentGateway sidecar is running.', tone: 'success'},
  unavailable: {label: 'Unavailable', description: 'AI routes are unavailable; local search is unaffected.', tone: 'warning'},
};

export function GatewayStatusPanel({state, onRestart}: {state: GatewayState; onRestart(): void}) {
  const copy = stateCopy[state];
  const StateIcon = copy.tone === 'success' ? CheckCircleIcon : copy.tone === 'warning' ? WarningCircleIcon : ArrowClockwiseIcon;
  return (
    <section data-testid={`gateway-${state}`} aria-label="AgentGateway status" {...stylex.props(styles.panel)}>
      <span aria-hidden="true" {...stylex.props(styles.icon)}><GatewayIcon size={26} /></span>
      <div {...stylex.props(styles.text)}>
        <div {...stylex.props(styles.stateLine)}>
          <StateIcon aria-hidden="true" size={16} />
          <LumenText weight="semibold">{copy.label}</LumenText>
        </div>
        <LumenText tone="tertiary" variant="meta">{copy.description}</LumenText>
      </div>
      <LumenButton aria-label="Restart AgentGateway" size="small" onPress={onRestart}>Restart</LumenButton>
    </section>
  );
}
