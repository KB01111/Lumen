import type {ReactNode} from 'react';

import {LumenText} from '../../design-system/primitives/LumenText';

export function DiagnosticItem({label, children}: {label: string; children: ReactNode}) {
  return (
    <div className="grid min-h-12 grid-cols-[minmax(120px,.65fr)_minmax(0,1fr)] items-center gap-5 border-b border-border-subtle px-5 py-3 last:border-b-0">
      <LumenText tone="tertiary" variant="meta">{label}</LumenText>
      <LumenText className="min-w-0 break-words" variant="meta" weight="medium">{children}</LumenText>
    </div>
  );
}
