import {motion} from 'motion/react';

import {useLumenMotion} from '../../design-system/MotionProvider';
import {activityPresentations} from '../activity/activity.types';
import {useActivityStore} from '../activity/activity.store';

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
      className="inline-flex shrink-0 items-center gap-1.5"
    >
      {pulse ? (
        <motion.span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-success shadow-[0_0_9px_var(--lumen-success)]"
          animate={{opacity: [1, 0.3, 1]}}
          transition={{duration: 1.1, ease: 'easeInOut', repeat: Infinity}}
        />
      ) : (
        <span
          aria-hidden="true"
          className={activityActive
            ? 'size-1.5 rounded-full bg-warning'
            : 'size-1.5 rounded-full bg-success shadow-[0_0_9px_var(--lumen-success)]'}
        />
      )}
      <span className="text-xs text-[color:var(--einui-command-muted-text)]">
        {activityActive ? activityLabel : label}
      </span>
    </output>
  );
}
