import {LumenUiIcon} from '../../design-system/icons/LumenUiIcon';
import {LumenText} from '../../design-system/primitives/LumenText';
import {shortcutAriaLabel} from '../settings/shortcut-format';
import {OnboardingScene} from './OnboardingScene';

export function ShortcutScene({shortcut}: {shortcut: string}) {
  return (
    <OnboardingScene
      description="Lumen is always one chord away, from any screen."
      icon={<LumenUiIcon className="size-12" name="keyboard" />}
      support="You can record a different global shortcut in General settings."
      title="Make search a reflex"
    >
      <kbd aria-label={shortcutAriaLabel(shortcut)} className="min-w-0 max-w-full rounded-control border border-border-strong bg-surface-inset px-[24px] py-[12px] text-text-primary">
        <LumenText variant="bodyLarge" weight="semibold">{shortcut}</LumenText>
      </kbd>
    </OnboardingScene>
  );
}
