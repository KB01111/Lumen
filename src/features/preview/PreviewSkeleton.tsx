import * as stylex from '@stylexjs/stylex';
import {motion} from 'motion/react';

import {tokens} from '../../design-system/tokens.stylex';

const styles = stylex.create({
  root: {
    minHeight: '280px',
    display: 'grid',
    alignContent: 'start',
    gap: tokens.space8,
    padding: tokens.space12,
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
});

export function PreviewSkeleton({reducedMotion = false}: {reducedMotion?: boolean}) {
  return (
    <motion.div
      aria-label="Loading preview"
      role="status"
      {...stylex.props(styles.root)}
      animate={reducedMotion ? undefined : {opacity: [0.55, 1, 0.55]}}
      transition={reducedMotion ? undefined : {duration: 1.4, repeat: Infinity}}
    >
      <div {...stylex.props(styles.preview)} />
      <div {...stylex.props(styles.block, styles.title)} />
      <div {...stylex.props(styles.block, styles.medium)} />
      <div {...stylex.props(styles.block)} />
      <div {...stylex.props(styles.block, styles.short)} />
    </motion.div>
  );
}
