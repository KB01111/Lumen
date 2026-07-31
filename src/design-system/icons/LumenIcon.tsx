import type {ReactNode, SVGProps} from 'react';

import * as stylex from '@stylexjs/stylex';

import {tokens} from '../tokens.stylex';

const styles = stylex.create({
  icon: {
    display: 'block',
    flexShrink: 0,
    overflow: 'visible',
  },
  small: {
    width: tokens.iconSizeSmall,
    height: tokens.iconSizeSmall,
  },
  medium: {
    width: tokens.iconSizeMedium,
    height: tokens.iconSizeMedium,
  },
  large: {
    width: tokens.iconSizeLarge,
    height: tokens.iconSizeLarge,
  },
});

export interface LumenIconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  children: ReactNode;
  size?: 'small' | 'medium' | 'large' | number;
  title?: string;
}

export function LumenIcon({
  children,
  className,
  size = 'medium',
  title,
  ...props
}: LumenIconProps) {
  const namedSize = typeof size === 'number' ? undefined : styles[size];
  const explicitSize = typeof size === 'number' ? size : undefined;
  const generatedClassName = stylex.props(styles.icon, namedSize).className;

  return (
    <svg
      {...props}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={[generatedClassName, className].filter(Boolean).join(' ')}
      fill="none"
      focusable="false"
      height={explicitSize}
      role={title ? 'img' : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.65"
      viewBox="0 0 24 24"
      width={explicitSize}
    >
      <g vectorEffect="non-scaling-stroke">{children}</g>
    </svg>
  );
}

