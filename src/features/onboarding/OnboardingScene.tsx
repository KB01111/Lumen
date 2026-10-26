import type {ReactNode} from 'react';

import {LumenText} from '../../design-system/primitives/LumenText';

export interface OnboardingSceneProps {
  description: string;
  icon: ReactNode;
  support: string;
  title: string;
  children?: ReactNode;
}

export function OnboardingScene({
  children,
  description,
  icon,
  support,
  title,
}: OnboardingSceneProps) {
  return (
    <div className="mx-auto grid min-w-0 w-full max-w-[680px] justify-items-center gap-[24px] px-[24px] text-center [overflow-wrap:anywhere]">
      <div aria-hidden="true" className="relative grid size-[76px] place-items-center">
        <span data-material-layer="luminosity" className="absolute inset-[-28px] rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--lumen-beam)_22%,transparent),transparent)] high-contrast:hidden" />
        <span className="relative grid size-[76px] place-items-center rounded-[24px] border border-border-strong bg-[linear-gradient(160deg,var(--lumen-surface-raised),var(--lumen-surface-inset))] text-accent shadow-[inset_0_1px_0_var(--lumen-border-specular),0_18px_40px_-18px_var(--lumen-accent)]">{icon}</span>
      </div>
      <div className="grid min-w-0 w-full max-w-[576px] gap-[12px]">
        <LumenText as="h1" className="text-balance" variant="title" weight="semibold">{title}</LumenText>
        <LumenText tone="secondary" variant="bodyLarge">{description}</LumenText>
        <LumenText tone="tertiary">{support}</LumenText>
      </div>
      {children}
    </div>
  );
}
