import type {ReactNode} from 'react';

import {LumenText} from '../../../design-system/primitives/LumenText';

export interface SettingRowProps {
  children: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  label: ReactNode;
  status?: ReactNode;
}

export function SettingRow({children, description, error, label, status}: SettingRowProps) {
  return (
    <div className="grid min-h-[62px] grid-cols-[minmax(0,1fr)_auto] items-center gap-6 border-b border-border-subtle px-6 py-4 last:border-b-0">
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <LumenText weight="medium">{label}</LumenText>
          {status}
        </div>
        {description ? <LumenText tone="tertiary" variant="meta">{description}</LumenText> : null}
        {error ? <LumenText className="text-danger" role="alert" variant="meta">{error}</LumenText> : null}
      </div>
      <div className="flex items-center justify-end gap-2">{children}</div>
    </div>
  );
}
