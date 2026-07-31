import type {ButtonProps} from 'react-aria-components';

import * as stylex from '@stylexjs/stylex';

import {tokens} from '../tokens.stylex';
import {
  LumenButton,
  type LumenButtonSize,
  type LumenButtonVariant,
} from './LumenButton';

const styles = stylex.create({
  iconButton: {
    flexShrink: 0,
    paddingInline: 0,
  },
  small: {
    width: tokens.controlHeightSmall,
  },
  medium: {
    width: tokens.controlHeightMedium,
  },
  large: {
    width: tokens.controlHeightLarge,
  },
});

export interface LumenIconButtonProps extends ButtonProps {
  'aria-label': string;
  size?: LumenButtonSize;
  variant?: LumenButtonVariant;
}

export function LumenIconButton({
  className,
  size = 'medium',
  variant = 'quiet',
  ...props
}: LumenIconButtonProps) {
  const generatedClassName = stylex.props(
    styles.iconButton,
    styles[size],
  ).className;

  return (
    <LumenButton
      {...props}
      className={(renderProps) => {
        const customClassName =
          typeof className === 'function' ? className(renderProps) : className;
        return [generatedClassName, customClassName].filter(Boolean).join(' ');
      }}
      size={size}
      variant={variant}
    />
  );
}

