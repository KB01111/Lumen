import {Fragment} from 'react';

import {LumenUiIcon} from '../../design-system/icons/LumenUiIcon';
import {shortcutAriaLabel, shortcutKeys} from '../settings/shortcut-format';
import {OnboardingScene} from './OnboardingScene';

export function ShortcutScene({shortcut}: {shortcut: string}) {
  return (
    <OnboardingScene
      description="Lumen is always one chord away, from any screen."
      icon={<LumenUiIcon className="size-10" name="keyboard" />}
      support="You can record a different global shortcut in General settings."
      title="Make search a reflex"
    >
      <kbd aria-label={shortcutAriaLabel(shortcut)} className="flex min-w-0 max-w-full flex-wrap items-center justify-center gap-[10px] font-sans">
        {shortcutKeys(shortcut).map((key, index) => (
          <Fragment key={`${key}-${index}`}>
            {index > 0 ? <span aria-hidden="true" className="text-lg text-text-tertiary">+</span> : null}
            <span className="grid min-h-[52px] min-w-[64px] place-items-center rounded-[14px] border border-border-strong border-b-[3px] bg-surface-raised px-[20px] text-[1.0625rem] font-semibold text-text-primary shadow-[0_8px_24px_-12px_var(--lumen-accent)]">
              {key}
            </span>
          </Fragment>
        ))}
      </kbd>
    </OnboardingScene>
  );
}
