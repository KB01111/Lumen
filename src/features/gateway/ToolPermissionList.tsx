import * as stylex from '@stylexjs/stylex';

import {LumenText} from '../../design-system/primitives/LumenText';
import {tokens} from '../../design-system/tokens.stylex';
import {LumenSelect} from '../settings/components/SettingsControls';
import type {ToolAccess, ToolPermission} from './gateway.types';

const styles = stylex.create({
  row: {
    minHeight: '66px',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: tokens.space8,
    padding: tokens.space8,
    borderBottomColor: tokens.colorBorderSubtle,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    ':last-child': {borderBottomWidth: 0},
  },
  text: {display: 'grid', gap: tokens.space2},
});

export function ToolPermissionList({permissions, onChange}: {
  permissions: ToolPermission[];
  onChange(id: string, access: ToolAccess): void;
}) {
  return (
    <div>
      {permissions.map((permission) => (
        <div key={permission.id} {...stylex.props(styles.row)}>
          <div {...stylex.props(styles.text)}>
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
