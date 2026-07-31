import * as stylex from '@stylexjs/stylex';

import {LumenText} from '../../design-system/primitives/LumenText';
import {tokens} from '../../design-system/tokens.stylex';
import {activityPresentations} from '../activity/activity.types';
import {useActivityStore} from '../activity/activity.store';

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
  pausedDot: {
    backgroundColor: tokens.colorWarning,
    boxShadow: 'none',
  },
});

export interface LauncherStatusProps {
  label?: string;
}

export function LauncherStatus({label = 'Ready'}: LauncherStatusProps) {
  const activityActive = useActivityStore((state) => state.active);
  const activityMode = useActivityStore((state) => state.mode);
  const activityLabel = activityPresentations[activityMode].compactLabel;
  return (
    <output
      aria-live="polite"
      data-activity-compact={activityActive || undefined}
      data-testid={activityActive ? 'launcher-activity' : undefined}
      {...stylex.props(styles.status)}
    >
      <span aria-hidden="true" {...stylex.props(styles.dot, activityActive && styles.pausedDot)} />
      <LumenText tone="tertiary" variant="caption">
        {activityActive ? activityLabel : label}
      </LumenText>
    </output>
  );
}
