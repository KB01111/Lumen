import * as stylex from '@stylexjs/stylex';

import {LumenUiIcon} from '../../design-system/icons/LumenUiIcon';
import {LumenIconButton} from '../../design-system/primitives/LumenIconButton';
import {LumenText} from '../../design-system/primitives/LumenText';
import {tokens} from '../../design-system/tokens.stylex';
import {LumenSelect} from '../settings/components/SettingsControls';
import type {ApplicationOverride} from '../settings/settings.schema';

const styles = stylex.create({
  row: {
    minHeight: '58px',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto auto',
    alignItems: 'center',
    gap: tokens.space5,
    padding: tokens.space8,
    borderBottomColor: tokens.colorBorderSubtle,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    ':last-child': {borderBottomWidth: 0},
  },
});

export function ApplicationOverrideRow({override, onChange, onRemove}: {
  override: ApplicationOverride;
  onChange(override: ApplicationOverride): void;
  onRemove(): void;
}) {
  return (
    <div {...stylex.props(styles.row)}>
      <LumenText weight="medium">{override.application}</LumenText>
      <LumenSelect
        aria-label={`Policy for ${override.application}`}
        options={[
          {id: 'automatic', label: 'Automatic'},
          {id: 'pause', label: 'Always pause'},
          {id: 'cinema', label: 'Cinema mode'},
          {id: 'allow', label: 'Allow indexing'},
        ]}
        value={override.policy}
        onChange={(policy) => onChange({...override, policy})}
      />
      <LumenIconButton aria-label={`Remove ${override.application}`} size="small" variant="quiet" onPress={onRemove}>
        <LumenUiIcon name="delete" size="small" />
      </LumenIconButton>
    </div>
  );
}
