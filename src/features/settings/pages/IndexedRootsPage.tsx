import {useState} from 'react';

import {FolderOpenIcon} from '@phosphor-icons/react';
import * as stylex from '@stylexjs/stylex';

import {LumenButton} from '../../../design-system/primitives/LumenButton';
import {LumenText} from '../../../design-system/primitives/LumenText';
import {tokens} from '../../../design-system/tokens.stylex';
import {
  createRootSelectionService,
  type RootSelectionService,
} from '../../onboarding/root-selection-service';
import {IndexedRootRow} from '../components/IndexedRootRow';
import {createIndexedRoot} from '../indexed-root';
import {SettingSection} from '../components/SettingSection';
import {SettingsCallout, SettingsPage} from '../components/SettingsPage';
import {useSettingsStore} from '../settings.store';

const defaultRootService = createRootSelectionService();

const styles = stylex.create({
  toolbar: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: tokens.space8},
  empty: {
    minHeight: '190px',
    display: 'grid',
    placeItems: 'center',
    gap: tokens.space6,
    padding: tokens.space12,
    textAlign: 'center',
  },
  emptyIcon: {
    width: '54px',
    height: '54px',
    display: 'grid',
    placeItems: 'center',
    color: tokens.colorAccent,
    backgroundColor: tokens.colorAccentMuted,
    borderRadius: tokens.radiusLarge,
  },
});

export function IndexedRootsPage({rootService = defaultRootService}: {rootService?: RootSelectionService}) {
  const roots = useSettingsStore((state) => state.roots);
  const setRoots = useSettingsStore((state) => state.setRoots);
  const [message, setMessage] = useState('');
  const [choosing, setChoosing] = useState(false);

  const addRoot = async () => {
    setChoosing(true);
    setMessage('');
    try {
      const path = await rootService.chooseRoot();
      if (!path) {
        setMessage('No folder was selected.');
        return;
      }
      if (roots.some((root) => root.path.toLowerCase() === path.toLowerCase())) {
        setMessage('That folder is already an indexed root.');
        return;
      }
      await setRoots([...roots, createIndexedRoot(path)]);
      setMessage(`${path} is ready for the development filename adapter.`);
    } finally {
      setChoosing(false);
    }
  };

  return (
    <SettingsPage>
      <div {...stylex.props(styles.toolbar)}>
        <LumenText tone="secondary">{roots.length} {roots.length === 1 ? 'root' : 'roots'}</LumenText>
        <LumenButton aria-label="Add root" isDisabled={choosing} size="small" variant="primary" onPress={addRoot}>
          <FolderOpenIcon aria-hidden="true" size={16} />
          {choosing ? 'Choosing…' : 'Add root'}
        </LumenButton>
      </div>
      {message ? <SettingsCallout>{message}</SettingsCallout> : null}
      <SettingSection title="Development search directories" description="Phase one searches filenames in these folders with straightforward local traversal.">
        {roots.length === 0 ? (
          <div {...stylex.props(styles.empty)}>
            <span aria-hidden="true" {...stylex.props(styles.emptyIcon)}><FolderOpenIcon size={26} weight="duotone" /></span>
            <div>
              <LumenText as="p" weight="semibold">Choose a focused folder to begin</LumenText>
              <LumenText as="p" tone="tertiary" variant="meta">Project folders keep the development adapter quick and predictable.</LumenText>
            </div>
          </div>
        ) : roots.map((root) => (
          <IndexedRootRow
            key={root.id}
            root={root}
            onChange={(next) => void setRoots(roots.map((item) => item.id === root.id ? next : item))}
            onRemove={() => void setRoots(roots.filter((item) => item.id !== root.id))}
          />
        ))}
      </SettingSection>
    </SettingsPage>
  );
}
