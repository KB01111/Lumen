import {forwardRef, type HTMLAttributes, type ReactNode} from 'react';

import * as stylex from '@stylexjs/stylex';

import {materialStyles} from '../materials.stylex';

export type LumenMaterial = 'mica' | 'raised' | 'inset' | 'flat';

export interface LumenSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  material?: LumenMaterial;
}

export const LumenSurface = forwardRef<HTMLDivElement, LumenSurfaceProps>(
  function LumenSurface(
    {children, className, material = 'mica', ...props},
    ref,
  ) {
    const generatedClassName = stylex.props(
      materialStyles.surface,
      materialStyles[material],
    ).className;

    return (
      <div
        {...props}
        ref={ref}
        className={[generatedClassName, className].filter(Boolean).join(' ')}
        data-material={material}
      >
        <span aria-hidden="true" {...stylex.props(materialStyles.tint)} />
        <span aria-hidden="true" {...stylex.props(materialStyles.luminosity)} />
        <span aria-hidden="true" {...stylex.props(materialStyles.noise)} />
        <div {...stylex.props(materialStyles.content)}>{children}</div>
      </div>
    );
  },
);

