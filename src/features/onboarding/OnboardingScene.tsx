import type {ReactNode} from 'react';

import * as stylex from '@stylexjs/stylex';

import {LumenText} from '../../design-system/primitives/LumenText';
import {tokens} from '../../design-system/tokens.stylex';

const styles = stylex.create({
  root: {
    minWidth: 0,
    display: 'grid',
    justifyItems: 'center',
    gap: tokens.space10,
    paddingInline: tokens.space24,
    textAlign: 'center',
  },
  visual: {
    width: '104px',
    height: '104px',
    display: 'grid',
    placeItems: 'center',
    color: tokens.colorAccent,
    backgroundColor: tokens.colorAccentMuted,
    borderColor: tokens.colorBorderStrong,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusLarge,
    boxShadow: `${tokens.shadowInsetTop}, 0 18px 42px rgba(52, 155, 225, 0.12)`,
  },
  copy: {
    maxWidth: '520px',
    display: 'grid',
    gap: tokens.space6,
  },
});

export interface OnboardingSceneProps {
  description: string;
  icon: ReactNode;
  support: string;
  title: string;
  children?: ReactNode;
}

export function OnboardingScene({
  children,
  description,
  icon,
  support,
  title,
}: OnboardingSceneProps) {
  return (
    <div {...stylex.props(styles.root)}>
      <div aria-hidden="true" {...stylex.props(styles.visual)}>{icon}</div>
      <div {...stylex.props(styles.copy)}>
        <LumenText as="h1" variant="title" weight="semibold">{title}</LumenText>
        <LumenText variant="bodyLarge">{description}</LumenText>
        <LumenText tone="secondary">{support}</LumenText>
      </div>
      {children}
    </div>
  );
}
