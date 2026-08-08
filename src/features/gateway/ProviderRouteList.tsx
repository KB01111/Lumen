import {LumenButton} from '../../design-system/primitives/LumenButton';
import {LumenText} from '../../design-system/primitives/LumenText';
import {LumenSelect} from '../settings/components/SettingsControls';
import {StatusBadge} from '../settings/components/StatusBadge';
import type {ProviderRoute} from './gateway.types';

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
        <div key={route.id} className="grid min-h-[72px] grid-cols-[minmax(108px,.7fr)_minmax(150px,1fr)_auto] items-center gap-4 border-b border-border-subtle p-5 last:border-b-0">
          <div className="grid min-w-0 gap-1">
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
          <div className="flex items-center justify-end gap-3">
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
