import {LumenText} from '../../design-system/primitives/LumenText';
import {LumenSelect} from '../settings/components/SettingsControls';
import type {ToolAccess, ToolPermission} from './gateway.types';

export function ToolPermissionList({permissions, onChange}: {
  permissions: ToolPermission[];
  onChange(id: string, access: ToolAccess): void;
}) {
  return (
    <div>
      {permissions.map((permission) => (
        <div key={permission.id} className="grid min-h-[66px] grid-cols-[minmax(0,1fr)_auto] items-center gap-6 border-b border-border-subtle p-5 last:border-b-0">
          <div className="grid min-w-0 gap-1">
            <LumenText weight="medium">{permission.label}</LumenText>
            <LumenText tone="tertiary" variant="meta">{permission.description}</LumenText>
          </div>
          <LumenSelect
            aria-label={`Permission for ${permission.label}`}
            options={[{id: 'ask', label: 'Ask every time'}, {id: 'allow', label: 'Allow'}, {id: 'deny', label: 'Deny'}]}
            value={permission.access}
            onChange={(access) => onChange(permission.id, access)}
          />
        </div>
      ))}
    </div>
  );
}
