import {createElement, type HTMLAttributes} from 'react';

import {cn} from '../../lib/cn';

type TextElement = 'span' | 'p' | 'div' | 'h1' | 'h2' | 'h3' | 'label' | 'small';
export type LumenTextVariant = 'display' | 'title' | 'bodyLarge' | 'body' | 'meta' | 'caption';
export type LumenTextTone = 'primary' | 'secondary' | 'tertiary' | 'accent';
export type LumenTextWeight = 'regular' | 'medium' | 'semibold';

export interface LumenTextProps extends HTMLAttributes<HTMLElement> {
  as?: TextElement;
  tone?: LumenTextTone;
  variant?: LumenTextVariant;
  weight?: LumenTextWeight;
}

const variantClasses: Record<LumenTextVariant, string> = {
  display: 'font-display text-[2.375rem] font-[620] leading-[1.15] tracking-[-0.018em]',
  title: 'font-display text-[1.75rem] font-[620] leading-[1.15] tracking-[-0.018em]',
  bodyLarge: 'text-[0.9375rem] leading-[1.45]',
  body: 'text-sm leading-[1.45]',
  meta: 'text-xs leading-[1.45]',
  caption: 'text-[0.6875rem] leading-[1.45]',
};

const toneClasses: Record<LumenTextTone, string> = {
  primary: 'text-text-primary',
  secondary: 'text-text-secondary',
  tertiary: 'text-text-tertiary',
  accent: 'text-accent',
};

const weightClasses: Record<LumenTextWeight, string> = {
  regular: 'font-normal',
  medium: 'font-[520]',
  semibold: 'font-[620]',
};

export function LumenText({
  as = 'span',
  className,
  tone = 'primary',
  variant = 'body',
  weight = 'regular',
  ...props
}: LumenTextProps) {
  return createElement(as, {
    ...props,
    className: cn(
      'm-0 font-sans tracking-[-0.006em] text-pretty',
      variantClasses[variant],
      toneClasses[tone],
      weightClasses[weight],
      className,
    ),
  });
}

