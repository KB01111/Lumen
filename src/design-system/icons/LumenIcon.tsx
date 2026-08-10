import type {ReactNode, SVGProps} from 'react';

import {cn} from '../../lib/cn';

const iconSizes = {
  small: 'size-3.5',
  medium: 'size-[18px]',
  large: 'size-[22px]',
} as const;

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
  const namedSize = typeof size === 'number' ? undefined : iconSizes[size];
  const explicitSize = typeof size === 'number' ? size : undefined;

  return (
    <svg
      {...props}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn('block shrink-0 overflow-visible', namedSize, className)}
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
      {title ? <title>{title}</title> : null}
      <g vectorEffect="non-scaling-stroke">{children}</g>
    </svg>
  );
}
