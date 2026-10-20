import {Radio, RadioGroup} from '@fluentui/react-components';

import type {RuntimeMode} from '../../services/answer/answer.types';

const modes: readonly {id: RuntimeMode; label: string}[] = [
  {id: 'auto', label: 'Auto'}, {id: 'local', label: 'Local'}, {id: 'cloud', label: 'Cloud'},
];

export interface RuntimeModeSwitchProps {
  mode: RuntimeMode;
  onChange(mode: RuntimeMode): void;
}

export function RuntimeModeSwitch({mode, onChange}: RuntimeModeSwitchProps) {
  return (
    <RadioGroup aria-label="Answer runtime" className="min-w-0" layout="horizontal" value={mode} onChange={(_event, data) => onChange(data.value as RuntimeMode)}>
      {modes.map((option) => (
        <Radio key={option.id} label={option.label} value={option.id} />
      ))}
    </RadioGroup>
  );
}
