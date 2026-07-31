import type {PropsWithChildren, ReactNode} from 'react';

import * as stylex from '@stylexjs/stylex';

import {LumenText} from '../../../design-system/primitives/LumenText';
import {tokens} from '../../../design-system/tokens.stylex';

const styles = stylex.create({
  stack: {display: 'grid', alignContent: 'start', gap: tokens.space12},
  callout: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.space6,
    padding: tokens.space8,
    backgroundColor: tokens.colorInfoMuted,
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusMedium,
  },
  calloutWarning: {backgroundColor: tokens.colorWarningMuted},
  calloutError: {backgroundColor: tokens.colorErrorMuted},
});

export function SettingsPage({children}: PropsWithChildren) {
  return <div {...stylex.props(styles.stack)}>{children}</div>;
}

export function SettingsCallout({children, tone = 'info'}: {children: ReactNode; tone?: 'info' | 'warning' | 'error'}) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} {...stylex.props(
      styles.callout,
      tone === 'warning' && styles.calloutWarning,
      tone === 'error' && styles.calloutError,
    )}>
      <LumenText tone="secondary" variant="meta">{children}</LumenText>
    </div>
  );
}
