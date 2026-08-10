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
    <div className="grid min-w-0 justify-items-center gap-8 px-8 text-center sm:px-16">
      <div aria-hidden="true" className="grid size-24 place-items-center rounded-surface border border-border-strong bg-surface-inset text-accent shadow-control">{icon}</div>
      <div className="grid max-w-xl gap-4">
        <LumenText as="h1" variant="title" weight="semibold">{title}</LumenText>
        <LumenText variant="bodyLarge">{description}</LumenText>
        <LumenText tone="secondary">{support}</LumenText>
      </div>
      {children}
    </div>
  );
}
