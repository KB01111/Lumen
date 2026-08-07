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
          'einui-command-palette-wrapper relative isolate flex size-full min-w-0 flex-col overflow-visible',
          className,
        )}
        data-expanded={expanded}
        data-upstream="einui-glass-command-palette"
      >
        <span
          aria-hidden="true"
          className="einui-command-exterior-glow einui-command-exterior-colour-glow"
          data-einui-layer="exterior-colour-glow"
          data-palette-decoration="exterior"
        />
        <span
          aria-hidden="true"
          className="einui-command-exterior-glow einui-command-exterior-white-glow"
          data-einui-layer="exterior-white-glow"
          data-palette-decoration="exterior"
        />
        <div
          className="einui-command-palette relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[color:var(--einui-command-border)] bg-[var(--einui-command-surface)] text-[color:var(--einui-command-text)] shadow-[var(--einui-command-shadow)] backdrop-blur-3xl"
          data-einui-layer="surface"
          data-material="raised"
          style={{borderRadius: expanded ? 'var(--lumen-radius-surface)' : 'var(--lumen-radius-pill)'}}
        >
          <span
            aria-hidden="true"
            className="einui-command-specular einui-command-specular-top"
            data-einui-layer="specular-top"
            data-palette-decoration="surface"
          />
          <span
            aria-hidden="true"
            className="einui-command-specular einui-command-specular-corner"
            data-einui-layer="specular-corner"
            data-palette-decoration="surface"
          />
          <div className="relative z-10 flex min-h-0 flex-1 flex-col">
            <div className="einui-command-composer" data-einui-slot="composer">
              {composer}
            </div>
            {expanded ? (
              <div className="einui-command-workspace" data-einui-slot="workspace">
                {scopes !== undefined && scopes !== null ? <div className="einui-command-scopes" data-einui-slot="scopes">{scopes}</div> : null}
                <div className="einui-command-body" data-einui-slot="body">{body}</div>
              </div>
            ) : null}
            {expanded && footer !== undefined && footer !== null ? (
              <div className="einui-command-footer" data-einui-slot="footer">{footer}</div>
            ) : null}
          </div>
        </div>
      </div>
    );
  },
);
