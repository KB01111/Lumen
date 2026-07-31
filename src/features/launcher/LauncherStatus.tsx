import * as stylex from '@stylexjs/stylex';

import {LumenText} from '../../design-system/primitives/LumenText';
import {tokens} from '../../design-system/tokens.stylex';

const styles = stylex.create({
  status: {
    display: 'inline-flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: tokens.space3,
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: tokens.radiusRound,
    backgroundColor: tokens.colorSuccess,
    boxShadow: `0 0 9px ${tokens.colorSuccess}`,
  },
});

export interface LauncherStatusProps {
  label?: string;
}

export function LauncherStatus({label = 'Ready'}: LauncherStatusProps) {
  return (
    <output aria-live="polite" {...stylex.props(styles.status)}>
      <span aria-hidden="true" {...stylex.props(styles.dot)} />
      <LumenText tone="tertiary" variant="caption">
        {label}
      </LumenText>
    </output>
  );
}

