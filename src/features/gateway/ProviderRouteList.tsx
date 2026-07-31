import * as stylex from '@stylexjs/stylex';

import {LumenButton} from '../../design-system/primitives/LumenButton';
import {LumenText} from '../../design-system/primitives/LumenText';
import {tokens} from '../../design-system/tokens.stylex';
import {LumenSelect} from '../settings/components/SettingsControls';
import {StatusBadge} from '../settings/components/StatusBadge';
import type {ProviderRoute} from './gateway.types';

const styles = stylex.create({
  route: {
    minHeight: '72px',
    display: 'grid',
    gridTemplateColumns: 'minmax(108px, 0.7fr) minmax(150px, 1fr) auto',
    alignItems: 'center',
    gap: tokens.space6,
    padding: tokens.space8,
    borderBottomColor: tokens.colorBorderSubtle,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    ':last-child': {borderBottomWidth: 0},
  },
  alias: {display: 'grid', gap: tokens.space2},
  controls: {display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: tokens.space4},
});

const providers = [
  {id: 'local-cpu', label: 'CPU local preview'},
  {id: 'windows-local', label: 'Windows local preview'},
  {id: 'cloud-preview', label: 'Cloud provider preview'},
] as const;

export function ProviderRouteList({routes, onChange, onTest}: {
  routes: ProviderRoute[];
  onChange(id: string, providerId: string): void;
  onTest(id: string): void;
}) {
  return (
    <div>
      {routes.map((route) => (
        <div key={route.id} {...stylex.props(styles.route)}>
          <div {...stylex.props(styles.alias)}>
            <LumenText weight="medium">{route.alias}</LumenText>
            <StatusBadge tone={route.status === 'ready' ? 'success' : route.status === 'degraded' ? 'warning' : 'neutral'}>
              {route.status === 'ready' ? 'Ready' : route.status === 'degraded' ? 'Fallback' : 'Unavailable'}
            </StatusBadge>
          </div>
          <LumenSelect
            aria-label={`Provider for ${route.alias}`}
            options={providers}
            value={route.providerId as (typeof providers)[number]['id']}
            onChange={(providerId) => onChange(route.id, providerId)}
          />
          <div {...stylex.props(styles.controls)}>
            <LumenButton
              aria-label={route.id === 'fast' ? 'Test local provider' : `Test ${route.alias}`}
              size="small"
              variant="quiet"
              onPress={() => onTest(route.id)}
            >
              Test
            </LumenButton>
          </div>
        </div>
      ))}
    </div>
  );
}
