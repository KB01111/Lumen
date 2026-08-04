import * as stylex from '@stylexjs/stylex';
import {motion} from 'motion/react';

import {useLumenMotion} from '../../design-system/MotionProvider';
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
  searching?: boolean;
}

export function LauncherStatus({label = 'Ready', searching = false}: LauncherStatusProps) {
  const {reducedMotion} = useLumenMotion();
  const activityActive = useActivityStore((state) => state.active);
  const activityMode = useActivityStore((state) => state.mode);
  const activityLabel = activityPresentations[activityMode].compactLabel;
  const pulse = searching && !activityActive && !reducedMotion;
  return (
    <output
      aria-live="polite"
      data-activity-compact={activityActive || undefined}
      data-testid={activityActive ? 'launcher-activity' : undefined}
      {...stylex.props(styles.status)}
    >
      {pulse ? (
        <motion.span
          aria-hidden="true"
          {...stylex.props(styles.dot)}
          animate={{opacity: [1, 0.3, 1]}}
          transition={{duration: 1.1, ease: 'easeInOut', repeat: Infinity}}
        />
      ) : (
        <span aria-hidden="true" {...stylex.props(styles.dot, activityActive && styles.pausedDot)} />
      )}
      <LumenText tone="tertiary" variant="caption">
        {activityActive ? activityLabel : label}
      </LumenText>
    </output>
  );
}
