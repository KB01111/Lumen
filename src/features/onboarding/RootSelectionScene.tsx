import {useState} from 'react';

import {FolderOpenIcon} from '@phosphor-icons/react';
import * as stylex from '@stylexjs/stylex';

import {LumenButton} from '../../design-system/primitives/LumenButton';
import {LumenText} from '../../design-system/primitives/LumenText';
import {tokens} from '../../design-system/tokens.stylex';
import {OnboardingScene} from './OnboardingScene';
import type {RootSelectionService} from './root-selection-service';

const styles = stylex.create({
  selection: {
    maxWidth: '440px',
    paddingBlock: tokens.space5,
    paddingInline: tokens.space8,
    overflow: 'hidden',
    color: tokens.colorTextSecondary,
    backgroundColor: tokens.colorMaterialInset,
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusMedium,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

export interface RootSelectionSceneProps {
  root: string;
  service: RootSelectionService;
  onRoot(root: string): boolean;
}

export function RootSelectionScene({root, service, onRoot}: RootSelectionSceneProps) {
  const [message, setMessage] = useState('');
  const chooseRoot = async () => {
    const selection = await service.chooseRoot();
    if (!selection) {
      setMessage('No folder was selected.');
      return;
    }
    setMessage(onRoot(selection) ? '' : 'Choose a valid local folder.');
  };

  return (
    <OnboardingScene
      description="Start with one development directory you know well."
      icon={<FolderOpenIcon size={48} weight="duotone" />}
      support="You can add, pause, exclude, or remove roots later."
      title="Choose one place to start"
    >
      <LumenButton size="large" variant="primary" onPress={chooseRoot}>
        Choose folder
      </LumenButton>
      {root ? <div title={root} {...stylex.props(styles.selection)}>{root}</div> : null}
      {message ? <LumenText role="status" tone="secondary" variant="caption">{message}</LumenText> : null}
    </OnboardingScene>
  );
}
