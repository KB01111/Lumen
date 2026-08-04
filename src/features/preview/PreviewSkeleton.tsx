import * as stylex from '@stylexjs/stylex';
import {motion} from 'motion/react';

import {tokens} from '../../design-system/tokens.stylex';

const styles = stylex.create({
  root: {
    position: 'relative',
    minHeight: '280px',
    display: 'grid',
    alignContent: 'start',
    gap: tokens.space8,
    padding: tokens.space12,
    overflow: 'hidden',
  },
  block: {
    height: '12px',
    backgroundColor: tokens.colorLuminosity,
    borderRadius: tokens.radiusRound,
  },
  title: {width: '56%', height: '18px'},
  medium: {width: '78%'},
  short: {width: '42%'},
  preview: {
    width: '100%',
    height: '144px',
    marginBlockEnd: tokens.space4,
    backgroundColor: tokens.colorMaterialInset,
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusMedium,
  },
  sweep: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '35%',
    pointerEvents: 'none',
    backgroundImage: `linear-gradient(100deg, transparent 0%, ${tokens.colorLuminosity} 50%, transparent 100%)`,
  },
});

export function PreviewSkeleton({reducedMotion = false}: {reducedMotion?: boolean}) {
  return (
    <div aria-label="Loading preview" role="status" {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.preview)} />
      <div {...stylex.props(styles.block, styles.title)} />
      <div {...stylex.props(styles.block, styles.medium)} />
      <div {...stylex.props(styles.block)} />
      <div {...stylex.props(styles.block, styles.short)} />
      {reducedMotion ? null : (
        <motion.span
          aria-hidden="true"
          {...stylex.props(styles.sweep)}
          animate={{x: ['-110%', '310%']}}
          transition={{duration: 1.4, ease: 'easeInOut', repeat: Infinity}}
        />
      )}
    </div>
  );
}
