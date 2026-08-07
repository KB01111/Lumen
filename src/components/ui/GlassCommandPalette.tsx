import {forwardRef, type HTMLAttributes, type ReactNode} from 'react';

import {cn} from '../../lib/cn';

export interface GlassCommandPaletteProps extends HTMLAttributes<HTMLDivElement> {
  body?: ReactNode;
  composer: ReactNode;
  expanded: boolean;
  footer?: ReactNode;
  scopes?: ReactNode;
}

export const GlassCommandPalette = forwardRef<HTMLDivElement, GlassCommandPaletteProps>(
  function GlassCommandPalette(
    {
      body,
      className,
      composer,
      expanded,
      footer,
      scopes,
      ...props
    },
    ref,
  ) {
    return (
      <div
        {...props}
        ref={ref}
        className={cn(
          'einui-command-palette relative isolate flex size-full min-w-0 flex-col overflow-hidden rounded-2xl border border-[color:var(--einui-command-border)] bg-[var(--einui-command-surface)] text-[color:var(--einui-command-text)] shadow-[var(--einui-command-shadow)] backdrop-blur-3xl',
          className,
        )}
        data-expanded={expanded}
        data-material="raised"
        data-upstream="einui-glass-command-palette"
      >
        <span aria-hidden="true" className="einui-command-glow" />
        <span aria-hidden="true" className="einui-command-specular" />
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          {composer}
          {expanded ? scopes : null}
          {expanded ? <div className="min-h-0 flex-1 overflow-hidden">{body}</div> : null}
          {expanded ? footer : null}
        </div>
      </div>
    );
  },
);
