import type {ReactNode} from 'react';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

export interface StatusBadgeProps {
  children: ReactNode;
  tone?: StatusTone;
}

export function StatusBadge({children, tone = 'neutral'}: StatusBadgeProps) {
  return (
    <span className={['inline-flex min-h-[22px] items-center gap-1.5 rounded-pill border border-border-subtle bg-surface-inset px-2.5 font-sans text-xs font-medium leading-none whitespace-nowrap', tone === 'info' ? 'bg-accent/10 text-accent' : tone === 'success' ? 'bg-success/10 text-success' : tone === 'warning' ? 'bg-warning/10 text-warning' : tone === 'error' ? 'bg-danger/10 text-danger' : 'text-text-secondary'].join(' ')}>
      <span aria-hidden="true" className="size-1.5 rounded-pill bg-current" />
      {children}
    </span>
  );
}
