import type {PropsWithChildren, ReactNode} from 'react';

import {LumenText} from '../../../design-system/primitives/LumenText';

export function SettingsPage({children}: PropsWithChildren) {
  return <div className="grid content-start gap-8">{children}</div>;
}

export function SettingsCallout({children, tone = 'info'}: {children: ReactNode; tone?: 'info' | 'warning' | 'error'}) {
  return (
    <div className={['flex items-start gap-3 rounded-control border border-border-subtle p-5', tone === 'error' ? 'bg-danger/10' : tone === 'warning' ? 'bg-warning/10' : 'bg-accent/10'].join(' ')} role={tone === 'error' ? 'alert' : 'status'}>
      <LumenText tone="secondary" variant="meta">{children}</LumenText>
    </div>
  );
}
