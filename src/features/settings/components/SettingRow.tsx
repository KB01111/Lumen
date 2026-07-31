import type {ReactNode} from 'react';

import * as stylex from '@stylexjs/stylex';

import {LumenText} from '../../../design-system/primitives/LumenText';
import {tokens} from '../../../design-system/tokens.stylex';

const styles = stylex.create({
  row: {
    minHeight: '62px',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: tokens.space10,
    paddingBlock: tokens.space6,
    paddingInline: tokens.space8,
    borderBottomColor: tokens.colorBorderSubtle,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    ':last-child': {borderBottomWidth: 0},
  },
  text: {minWidth: 0, display: 'grid', gap: tokens.space2},
  labelLine: {display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: tokens.space4},
  control: {display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: tokens.space4},
  error: {color: tokens.colorError},
});

export interface SettingRowProps {
  children: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  label: ReactNode;
  status?: ReactNode;
}

export function SettingRow({children, description, error, label, status}: SettingRowProps) {
  return (
    <div {...stylex.props(styles.row)}>
      <div {...stylex.props(styles.text)}>
        <div {...stylex.props(styles.labelLine)}>
          <LumenText weight="medium">{label}</LumenText>
          {status}
        </div>
        {description ? <LumenText tone="tertiary" variant="meta">{description}</LumenText> : null}
        {error ? <LumenText className={stylex.props(styles.error).className} role="alert" variant="meta">{error}</LumenText> : null}
      </div>
      <div {...stylex.props(styles.control)}>{children}</div>
    </div>
  );
}
