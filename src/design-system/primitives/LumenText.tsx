import {createElement, type HTMLAttributes} from 'react';

import * as stylex from '@stylexjs/stylex';

import {tokens} from '../tokens.stylex';

const styles = stylex.create({
  base: {
    margin: 0,
    color: tokens.colorTextPrimary,
    fontFamily: tokens.fontFamilyText,
    textWrap: 'pretty',
  },
  display: {
    fontFamily: tokens.fontFamilyDisplay,
    fontSize: tokens.fontSizeDisplay,
    fontWeight: tokens.fontWeightSemibold,
    letterSpacing: tokens.letterSpacingTight,
    lineHeight: tokens.lineHeightTight,
  },
  title: {
    fontFamily: tokens.fontFamilyDisplay,
    fontSize: tokens.fontSizeTitle,
    fontWeight: tokens.fontWeightSemibold,
    letterSpacing: tokens.letterSpacingTight,
    lineHeight: tokens.lineHeightTight,
  },
  bodyLarge: {
    fontSize: tokens.fontSizeBodyLarge,
    lineHeight: tokens.lineHeightBody,
  },
  body: {
    fontSize: tokens.fontSizeBody,
    lineHeight: tokens.lineHeightBody,
  },
  meta: {
    fontSize: tokens.fontSizeMeta,
    lineHeight: tokens.lineHeightBody,
  },
  caption: {
    fontSize: tokens.fontSizeCaption,
    lineHeight: tokens.lineHeightBody,
  },
  primary: {
    color: tokens.colorTextPrimary,
  },
  secondary: {
    color: tokens.colorTextSecondary,
  },
  tertiary: {
    color: tokens.colorTextTertiary,
  },
  accent: {
    color: tokens.colorAccent,
  },
  regular: {
    fontWeight: tokens.fontWeightRegular,
  },
  medium: {
    fontWeight: tokens.fontWeightMedium,
  },
  semibold: {
    fontWeight: tokens.fontWeightSemibold,
  },
});

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

export function LumenText({
  as = 'span',
  className,
  tone = 'primary',
  variant = 'body',
  weight = 'regular',
  ...props
}: LumenTextProps) {
  const generatedClassName = stylex.props(
    styles.base,
    styles[variant],
    styles[tone],
    styles[weight],
  ).className;

  return createElement(as, {
    ...props,
    className: [generatedClassName, className].filter(Boolean).join(' '),
  });
}

