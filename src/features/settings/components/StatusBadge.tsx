import type {ReactNode} from 'react';

import * as stylex from '@stylexjs/stylex';

import {tokens} from '../../../design-system/tokens.stylex';

const styles = stylex.create({
  badge: {
    display: 'inline-flex',
    minHeight: '22px',
    alignItems: 'center',
    gap: tokens.space3,
    paddingInline: tokens.space5,
    color: tokens.colorTextSecondary,
    backgroundColor: tokens.colorMaterialInset,
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusRound,
    fontFamily: tokens.fontFamilyText,
    fontSize: tokens.fontSizeCaption,
    fontWeight: tokens.fontWeightMedium,
    lineHeight: tokens.lineHeightTight,
    whiteSpace: 'nowrap',
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: tokens.radiusRound,
    backgroundColor: 'currentColor',
  },
  neutral: {color: tokens.colorTextSecondary},
  info: {color: tokens.colorInfo, backgroundColor: tokens.colorInfoMuted},
  success: {color: tokens.colorSuccess, backgroundColor: tokens.colorSuccessMuted},
  warning: {color: tokens.colorWarning, backgroundColor: tokens.colorWarningMuted},
  error: {color: tokens.colorError, backgroundColor: tokens.colorErrorMuted},
});

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

export interface StatusBadgeProps {
  children: ReactNode;
  tone?: StatusTone;
}

export function StatusBadge({children, tone = 'neutral'}: StatusBadgeProps) {
  return (
    <span {...stylex.props(styles.badge, styles[tone])}>
      <span aria-hidden="true" {...stylex.props(styles.dot)} />
      {children}
    </span>
  );
}
