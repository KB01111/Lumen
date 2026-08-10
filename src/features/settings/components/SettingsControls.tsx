import type {ReactNode} from 'react';

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

import {LumenUiIcon} from '../../../design-system/icons/LumenUiIcon';

const visuallyHidden = 'absolute size-px overflow-hidden [clip-path:inset(50%)]';
const focusRing = 'data-[focus-visible]:ring-2 data-[focus-visible]:ring-focus/70';

export function LumenSwitch(props: SwitchProps) {
  return (
    <Switch
      {...props}
      className={({isDisabled, isFocusVisible, isSelected}) => [
        'flex h-6 min-w-[42px] items-center rounded-pill border border-border-strong bg-surface-raised p-0.5 transition-[background-color,border-color,box-shadow] duration-150',
        isSelected ? 'border-accent bg-accent' : '',
        isFocusVisible ? 'ring-2 ring-focus/70' : '',
        isDisabled ? 'opacity-45' : '',
      ].filter(Boolean).join(' ')}
    >
      {({isSelected}) => <span className={isSelected ? 'size-[18px] translate-x-[18px] rounded-pill bg-text-inverse shadow-control transition-transform duration-150' : 'size-[18px] rounded-pill bg-text-primary shadow-control transition-transform duration-150'} />}
    </Switch>
  );
}

export interface SelectOption<T extends string> { id: T; label: string; }

export interface LumenSelectProps<T extends string> {
  'aria-label': string;
  options: readonly SelectOption<T>[];
  value: T;
  onChange(value: T): void;
}

export function LumenSelect<T extends string>({options, value, onChange, ...props}: LumenSelectProps<T>) {
  const handleChange = (key: Key | null) => {
    if (key !== null) onChange(String(key) as T);
  };
  return (
    <Select aria-label={props['aria-label']} selectedKey={value} onSelectionChange={handleChange}>
      <Label className={visuallyHidden}>{props['aria-label']}</Label>
      <Button className={`flex min-h-9 min-w-[132px] items-center justify-between gap-3 rounded-control border border-border-subtle bg-surface-raised px-4 font-sans text-sm text-text-primary outline-none ${focusRing}`}>
        <SelectValue />
        <LumenUiIcon className="rotate-90" name="next" size="small" />
      </Button>
      <Popover className="min-w-[var(--trigger-width)] rounded-control border border-border-strong bg-surface-raised p-1.5 text-text-primary shadow-surface">
        <ListBox items={options}>
          {(option) => (
            <ListBoxItem
              id={option.id}
              textValue={option.label}
              className={({isFocused, isSelected}) => [
                'flex min-h-9 items-center justify-between gap-4 rounded-control px-3 font-sans text-sm outline-none',
                isFocused ? 'bg-surface-inset' : '',
                isSelected ? 'text-accent' : '',
              ].filter(Boolean).join(' ')}
            >
              {({isSelected}) => <>{option.label}{isSelected ? <LumenUiIcon name="approval" size="small" /> : null}</>}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </Select>
  );
}

export interface LumenSliderProps {
  label: string; maxValue?: number; minValue?: number; step?: number; suffix?: string; value: number; onChange(value: number): void;
}

export function LumenSlider({label, maxValue = 100, minValue = 0, step = 1, suffix = '%', value, onChange}: LumenSliderProps) {
  return (
    <Slider aria-label={label} className="grid w-[168px] grid-cols-[1fr_auto] gap-2" maxValue={maxValue} minValue={minValue} step={step} value={value} onChange={(next) => onChange(Array.isArray(next) ? (next[0] ?? value) : next)}>
      <Label className={visuallyHidden}>{label}</Label>
      <SliderOutput className="font-sans text-xs text-text-secondary">{({state}) => `${state.getThumbValue(0)}${suffix}`}</SliderOutput>
      <SliderTrack className="col-span-full flex h-5 items-center"><span aria-hidden="true" className="h-1 w-full rounded-pill bg-surface-inset" /><SliderThumb className={`size-4 rounded-pill border border-border-specular bg-accent shadow-control outline-none ${focusRing}`} /></SliderTrack>
    </Slider>
  );
}

export function LumenCheckbox({children, ...props}: CheckboxProps & {children: ReactNode}) {
  return (
    <Checkbox {...props} className="inline-flex min-h-9 items-center gap-2 font-sans text-sm text-text-secondary outline-none">
      {({isFocusVisible, isSelected}) => (
        <><span className={["grid size-[18px] place-items-center rounded border border-border-strong bg-surface-raised text-text-inverse", isSelected ? 'border-accent bg-accent' : '', isFocusVisible ? 'ring-2 ring-focus/70' : ''].filter(Boolean).join(' ')}>{isSelected ? <LumenUiIcon name="approval" size="small" /> : null}</span>{children}</>
      )}
    </Checkbox>
  );
}

export interface LumenTextFieldProps {
  'aria-label': string; placeholder?: string; value: string; onChange(value: string): void; onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>; type?: 'text' | 'password';
}

export function LumenTextField(props: LumenTextFieldProps) {
  return <TextField aria-label={props['aria-label']} className="grid gap-1" value={props.value} onChange={props.onChange}><Input className={`min-h-9 w-full rounded-control border border-border-subtle bg-surface-inset px-4 font-sans text-sm text-text-primary caret-accent outline-none ${focusRing}`} placeholder={props.placeholder} type={props.type} onKeyDown={props.onKeyDown} /></TextField>;
}
