import {Button, type ButtonProps} from 'react-aria-components';

import * as stylex from '@stylexjs/stylex';

import {tokens} from '../tokens.stylex';

const styles = stylex.create({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space4,
    minWidth: tokens.targetMinimum,
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusMedium,
    color: tokens.colorTextPrimary,
    fontFamily: tokens.fontFamilyText,
    fontSize: tokens.fontSizeBody,
    fontWeight: tokens.fontWeightMedium,
    letterSpacing: tokens.letterSpacingBody,
    lineHeight: tokens.lineHeightTight,
    boxShadow: tokens.shadowControl,
    cursor: 'default',
    outlineColor: 'transparent',
    outlineOffset: '2px',
    outlineStyle: 'solid',
    outlineWidth: '2px',
    userSelect: 'none',
    transitionDuration: tokens.durationHover,
    transitionProperty: 'background-color, border-color, color, box-shadow, transform',
    transitionTimingFunction: tokens.easingStandard,
  },
  primary: {
    backgroundColor: tokens.colorAccent,
    borderColor: tokens.colorSpecularTop,
    color: tokens.colorTextInverse,
  },
  subtle: {
    backgroundColor: tokens.colorMaterialRaised,
  },
  quiet: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    boxShadow: 'none',
    color: tokens.colorTextSecondary,
  },
  danger: {
    backgroundColor: tokens.colorErrorMuted,
    borderColor: tokens.colorError,
    color: tokens.colorError,
  },
  small: {
    minHeight: tokens.controlHeightSmall,
    paddingInline: tokens.space6,
  },
  medium: {
    minHeight: tokens.controlHeightMedium,
    paddingInline: tokens.space8,
  },
  large: {
    minHeight: tokens.controlHeightLarge,
    paddingInline: tokens.space10,
    fontSize: tokens.fontSizeBodyLarge,
  },
  hovered: {
    backgroundColor: tokens.colorAccentMuted,
    borderColor: tokens.colorBorderStrong,
    color: tokens.colorTextPrimary,
  },
  primaryHovered: {
    backgroundColor: tokens.colorAccentHover,
    color: tokens.colorTextInverse,
  },
  pressed: {
    transform: 'translateY(1px) scale(0.985)',
    transitionDuration: tokens.durationPress,
  },
  focused: {
    outlineColor: tokens.colorFocus,
    boxShadow: `0 0 0 4px ${tokens.colorFocusSoft}, ${tokens.shadowControl}`,
  },
  disabled: {
    color: tokens.colorTextDisabled,
    cursor: 'not-allowed',
    opacity: 0.58,
    transform: 'none',
  },
});

export type LumenButtonVariant = 'primary' | 'subtle' | 'quiet' | 'danger';
export type LumenButtonSize = 'small' | 'medium' | 'large';

export interface LumenButtonProps extends ButtonProps {
  size?: LumenButtonSize;
  variant?: LumenButtonVariant;
}

export function LumenButton({
  className,
  size = 'medium',
  variant = 'subtle',
  ...props
}: LumenButtonProps) {
  return (
    <Button
      {...props}
      className={(renderProps) => {
        const customClassName =
          typeof className === 'function' ? className(renderProps) : className;
        const generatedClassName = stylex.props(
          styles.base,
          styles[variant],
          styles[size],
          renderProps.isHovered && styles.hovered,
          renderProps.isHovered && variant === 'primary' && styles.primaryHovered,
          renderProps.isPressed && styles.pressed,
          renderProps.isFocusVisible && styles.focused,
          renderProps.isDisabled && styles.disabled,
        ).className;

        return [generatedClassName, customClassName].filter(Boolean).join(' ');
      }}
      data-size={size}
      data-variant={variant}
    />
  );
}

