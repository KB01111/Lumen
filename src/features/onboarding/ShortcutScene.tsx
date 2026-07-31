import {KeyboardIcon} from '@phosphor-icons/react';
import * as stylex from '@stylexjs/stylex';

import {LumenText} from '../../design-system/primitives/LumenText';
import {tokens} from '../../design-system/tokens.stylex';
import {OnboardingScene} from './OnboardingScene';

const styles = stylex.create({
  shortcut: {
    paddingBlock: tokens.space5,
    paddingInline: tokens.space10,
    color: tokens.colorTextPrimary,
    backgroundColor: tokens.colorMaterialInset,
    borderColor: tokens.colorBorderStrong,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusMedium,
    boxShadow: tokens.shadowInsetBottom,
    fontFamily: tokens.fontFamilyText,
    fontSize: tokens.fontSizeBodyLarge,
  },
});

export function ShortcutScene({shortcut}: {shortcut: string}) {
  return (
    <OnboardingScene
      description="Lumen is always one chord away, from any screen."
      icon={<KeyboardIcon size={48} weight="duotone" />}
      support="You can record a different global shortcut in General settings."
      title="Make search a reflex"
    >
      <kbd aria-label={shortcut.replace(' + ', ' plus ')} {...stylex.props(styles.shortcut)}>
        <LumenText variant="bodyLarge" weight="semibold">{shortcut}</LumenText>
      </kbd>
    </OnboardingScene>
  );
}
