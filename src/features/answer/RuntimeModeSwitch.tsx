import {useId} from 'react';

import * as stylex from '@stylexjs/stylex';

import {tokens} from '../../design-system/tokens.stylex';
import type {RuntimeMode} from '../../services/answer/answer.types';

const styles = stylex.create({
  fieldset: {
    minWidth: 0,
    display: 'inline-flex',
    gap: tokens.space2,
    padding: tokens.space2,
    margin: 0,
    backgroundColor: tokens.colorMaterialInset,
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusRound,
  },
  legend: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  input: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    opacity: 0,
    pointerEvents: 'none',
  },
  label: {
    minHeight: '28px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingInline: tokens.space5,
    color: tokens.colorTextTertiary,
    borderRadius: tokens.radiusRound,
    cursor: 'default',
    outlineColor: 'transparent',
    outlineOffset: '1px',
    outlineStyle: 'solid',
    outlineWidth: '2px',
    fontFamily: tokens.fontFamilyText,
    fontSize: tokens.fontSizeCaption,
    fontWeight: tokens.fontWeightMedium,
    transitionDuration: tokens.durationHover,
    transitionProperty: 'background-color, color, box-shadow',
    ':focus-within': {
      outlineColor: tokens.colorFocus,
      boxShadow: `0 0 0 3px ${tokens.colorFocusSoft}`,
    },
  },
  selected: {
    color: tokens.colorTextPrimary,
    backgroundColor: tokens.colorAccentMuted,
    boxShadow: tokens.shadowControl,
  },
});

const modes: readonly {id: RuntimeMode; label: string}[] = [
  {id: 'auto', label: 'Auto'},
  {id: 'local', label: 'Local'},
  {id: 'cloud', label: 'Cloud'},
];

export interface RuntimeModeSwitchProps {
  mode: RuntimeMode;
  onChange(mode: RuntimeMode): void;
}

export function RuntimeModeSwitch({mode, onChange}: RuntimeModeSwitchProps) {
  const name = useId();
  return (
    <fieldset aria-label="Answer runtime" {...stylex.props(styles.fieldset)}>
      <legend {...stylex.props(styles.legend)}>Answer runtime</legend>
      {modes.map((option) => (
        <label key={option.id} {...stylex.props(styles.label, mode === option.id && styles.selected)}>
          <input
            checked={mode === option.id}
            name={name}
            type="radio"
            value={option.id}
            onChange={() => onChange(option.id)}
            {...stylex.props(styles.input)}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

