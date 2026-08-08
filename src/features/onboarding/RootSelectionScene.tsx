import {useState} from 'react';

import {LumenUiIcon} from '../../design-system/icons/LumenUiIcon';
import {LumenButton} from '../../design-system/primitives/LumenButton';
import {LumenText} from '../../design-system/primitives/LumenText';
import {OnboardingScene} from './OnboardingScene';
import type {RootSelectionService} from './root-selection-service';

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
      icon={<LumenUiIcon className="size-12" name="folderOpen" />}
      support="You can add, pause, exclude, or remove roots later."
      title="Choose one place to start"
    >
      <LumenButton size="large" variant="primary" onPress={chooseRoot}>
        Choose folder
      </LumenButton>
      {root ? <div className="max-w-[440px] truncate rounded-control border border-border-subtle bg-surface-inset px-5 py-3 text-text-secondary" title={root}>{root}</div> : null}
      {message ? <LumenText role="status" tone="secondary" variant="caption">{message}</LumenText> : null}
    </OnboardingScene>
  );
}
