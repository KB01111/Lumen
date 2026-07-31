import type {ReactNode} from 'react';

import {CaretDownIcon, CheckIcon} from '@phosphor-icons/react';
import * as stylex from '@stylexjs/stylex';
import {
  Button,
  Checkbox,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
  Slider,
  SliderOutput,
  SliderThumb,
  SliderTrack,
  Switch,
  TextField,
  type CheckboxProps,
  type Key,
  type SwitchProps,
} from 'react-aria-components';

import {tokens} from '../../../design-system/tokens.stylex';

const styles = stylex.create({
  switch: {
    minWidth: '42px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    padding: '2px',
    backgroundColor: tokens.colorMaterialRaised,
    borderColor: tokens.colorBorderStrong,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusRound,
    outlineColor: 'transparent',
    outlineOffset: '2px',
    outlineStyle: 'solid',
    outlineWidth: '2px',
    transitionDuration: tokens.durationHover,
    transitionProperty: 'background-color, border-color, box-shadow',
  },
  switchSelected: {backgroundColor: tokens.colorAccent, borderColor: tokens.colorAccentHover},
  switchFocused: {outlineColor: tokens.colorFocus, boxShadow: `0 0 0 3px ${tokens.colorFocusSoft}`},
  switchDisabled: {opacity: 0.46},
  switchThumb: {
    width: '18px',
    height: '18px',
    backgroundColor: tokens.colorTextPrimary,
    borderRadius: tokens.radiusRound,
    boxShadow: tokens.shadowControl,
    transform: 'translateX(0)',
    transitionDuration: tokens.durationSelection,
    transitionProperty: 'transform, background-color',
    transitionTimingFunction: tokens.easingStandard,
  },
  switchThumbSelected: {backgroundColor: tokens.colorTextInverse, transform: 'translateX(18px)'},
  selectButton: {
    minWidth: '132px',
    minHeight: tokens.controlHeightMedium,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.space5,
    paddingInline: tokens.space6,
    color: tokens.colorTextPrimary,
    backgroundColor: tokens.colorMaterialRaised,
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusMedium,
    outlineColor: 'transparent',
    outlineOffset: '2px',
    outlineStyle: 'solid',
    outlineWidth: '2px',
    fontFamily: tokens.fontFamilyText,
    fontSize: tokens.fontSizeBody,
  },
  focused: {outlineColor: tokens.colorFocus, boxShadow: `0 0 0 3px ${tokens.colorFocusSoft}`},
  popover: {
    minWidth: 'var(--trigger-width)',
    padding: tokens.space3,
    color: tokens.colorTextPrimary,
    backgroundColor: tokens.colorCanvasElevated,
    borderColor: tokens.colorBorderStrong,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusMedium,
    boxShadow: tokens.shadowAmbient,
  },
  option: {
    minHeight: tokens.controlHeightMedium,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.space6,
    paddingInline: tokens.space5,
    borderRadius: tokens.radiusSmall,
    outline: 'none',
    fontFamily: tokens.fontFamilyText,
    fontSize: tokens.fontSizeBody,
  },
  optionFocused: {backgroundColor: tokens.colorSelection},
  optionSelected: {color: tokens.colorAccent},
  slider: {width: '168px', display: 'grid', gridTemplateColumns: '1fr auto', gap: tokens.space4},
  sliderLabel: {position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clipPath: 'inset(50%)'},
  sliderOutput: {color: tokens.colorTextSecondary, fontFamily: tokens.fontFamilyText, fontSize: tokens.fontSizeMeta},
  track: {gridColumn: '1 / -1', height: '20px', display: 'flex', alignItems: 'center'},
  trackLine: {width: '100%', height: '4px', backgroundColor: tokens.colorMaterialRaised, borderRadius: tokens.radiusRound},
  thumb: {
    width: '16px',
    height: '16px',
    backgroundColor: tokens.colorAccent,
    borderColor: tokens.colorSpecularTop,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusRound,
    boxShadow: tokens.shadowControl,
    outlineColor: 'transparent',
    outlineOffset: '2px',
    outlineStyle: 'solid',
    outlineWidth: '2px',
  },
  checkbox: {
    minHeight: tokens.controlHeightMedium,
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.space4,
    color: tokens.colorTextSecondary,
    outline: 'none',
    fontFamily: tokens.fontFamilyText,
    fontSize: tokens.fontSizeBody,
  },
  checkboxBox: {
    width: '18px',
    height: '18px',
    display: 'grid',
    placeItems: 'center',
    color: tokens.colorTextInverse,
    backgroundColor: tokens.colorMaterialRaised,
    borderColor: tokens.colorBorderStrong,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusSmall,
  },
  checkboxSelected: {backgroundColor: tokens.colorAccent, borderColor: tokens.colorAccentHover},
  checkboxFocused: {boxShadow: `0 0 0 3px ${tokens.colorFocusSoft}`},
  textField: {display: 'grid', gap: tokens.space3},
  input: {
    width: '100%',
    minHeight: tokens.controlHeightMedium,
    paddingInline: tokens.space6,
    color: tokens.colorTextPrimary,
    caretColor: tokens.colorAccent,
    backgroundColor: tokens.colorMaterialInset,
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusMedium,
    outlineColor: 'transparent',
    outlineOffset: '2px',
    outlineStyle: 'solid',
    outlineWidth: '2px',
    fontFamily: tokens.fontFamilyText,
    fontSize: tokens.fontSizeBody,
  },
});

export function LumenSwitch(props: SwitchProps) {
  return (
    <Switch
      {...props}
      className={({isDisabled, isFocusVisible, isSelected}) => stylex.props(
        styles.switch,
        isSelected && styles.switchSelected,
        isFocusVisible && styles.switchFocused,
        isDisabled && styles.switchDisabled,
      ).className ?? ''}
    >
      {({isSelected}) => <span {...stylex.props(styles.switchThumb, isSelected && styles.switchThumbSelected)} />}
    </Switch>
  );
}

export interface SelectOption<T extends string> {
  id: T;
  label: string;
}

export interface LumenSelectProps<T extends string> {
  'aria-label': string;
  options: readonly SelectOption<T>[];
  value: T;
  onChange(value: T): void;
}

export function LumenSelect<T extends string>({options, value, onChange, ...props}: LumenSelectProps<T>) {
  const handleChange = (key: Key | null) => {
    if (key !== null) {
      onChange(String(key) as T);
    }
  };
  return (
    <Select aria-label={props['aria-label']} selectedKey={value} onSelectionChange={handleChange}>
      <Button className={({isFocusVisible}) => stylex.props(styles.selectButton, isFocusVisible && styles.focused).className ?? ''}>
        <SelectValue />
        <CaretDownIcon aria-hidden="true" size={14} />
      </Button>
      <Popover {...stylex.props(styles.popover)}>
        <ListBox items={options}>
          {(option) => (
            <ListBoxItem
              id={option.id}
              textValue={option.label}
              className={({isFocused, isSelected}) => stylex.props(
                styles.option,
                isFocused && styles.optionFocused,
                isSelected && styles.optionSelected,
              ).className ?? ''}
            >
              {({isSelected}) => <>{option.label}{isSelected ? <CheckIcon aria-hidden="true" size={14} /> : null}</>}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </Select>
  );
}

export interface LumenSliderProps {
  label: string;
  maxValue?: number;
  minValue?: number;
  step?: number;
  suffix?: string;
  value: number;
  onChange(value: number): void;
}

export function LumenSlider({label, maxValue = 100, minValue = 0, step = 1, suffix = '%', value, onChange}: LumenSliderProps) {
  return (
    <Slider
      aria-label={label}
      maxValue={maxValue}
      minValue={minValue}
      step={step}
      value={value}
      onChange={(next) => onChange(Array.isArray(next) ? (next[0] ?? value) : next)}
      {...stylex.props(styles.slider)}
    >
      <Label {...stylex.props(styles.sliderLabel)}>{label}</Label>
      <SliderOutput {...stylex.props(styles.sliderOutput)}>{({state}) => `${state.getThumbValue(0)}${suffix}`}</SliderOutput>
      <SliderTrack {...stylex.props(styles.track)}>
        <span aria-hidden="true" {...stylex.props(styles.trackLine)} />
        <SliderThumb className={({isFocusVisible}) => stylex.props(styles.thumb, isFocusVisible && styles.focused).className ?? ''} />
      </SliderTrack>
    </Slider>
  );
}

export function LumenCheckbox({children, ...props}: CheckboxProps & {children: ReactNode}) {
  return (
    <Checkbox {...props} className={stylex.props(styles.checkbox).className}>
      {({isFocusVisible, isSelected}) => (
        <>
          <span {...stylex.props(styles.checkboxBox, isSelected && styles.checkboxSelected, isFocusVisible && styles.checkboxFocused)}>
            {isSelected ? <CheckIcon aria-hidden="true" size={12} weight="bold" /> : null}
          </span>
          {children}
        </>
      )}
    </Checkbox>
  );
}

export interface LumenTextFieldProps {
  'aria-label': string;
  placeholder?: string;
  value: string;
  onChange(value: string): void;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
}

export function LumenTextField(props: LumenTextFieldProps) {
  return (
    <TextField aria-label={props['aria-label']} value={props.value} onChange={props.onChange} {...stylex.props(styles.textField)}>
      <Input
        className={({isFocusVisible}) => stylex.props(styles.input, isFocusVisible && styles.focused).className ?? ''}
        placeholder={props.placeholder}
        onKeyDown={props.onKeyDown}
      />
    </TextField>
  );
}
