import {useEffect, useState} from 'react';

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
import {isNativeRuntime, nativeAiService} from '../../../services/ai/native-ai-service';

const defaultRootService = createRootSelectionService();

const styles = stylex.create({
  toolbar: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: tokens.space8},
  actions: {display: 'flex', alignItems: 'center', gap: tokens.space6, flexWrap: 'wrap'},
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
  const cloudEnrichedRootIds = useSettingsStore((state) => state.ai.cloudEnrichedRootIds);
  const updateAi = useSettingsStore((state) => state.updateAi);
  const [message, setMessage] = useState('');
  const [choosing, setChoosing] = useState(false);
  const [indexBusy, setIndexBusy] = useState(false);

  useEffect(() => {
    if (!isNativeRuntime()) return;
    void nativeAiService.indexStatus().then((status) => setMessage(status.message));
  }, []);

  const synchronize = async (nextRoots = roots, cloudIds = cloudEnrichedRootIds) => {
    if (!isNativeRuntime()) return;
    const status = await nativeAiService.synchronizeRoots(nextRoots
      .filter((root) => !root.paused)
      .map((root) => ({path: root.path, cloudEnrichment: cloudIds.includes(root.id)})));
    setMessage(status.message);
  };

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
      const nextRoots = [...roots, createIndexedRoot(path)];
      await setRoots(nextRoots);
      await synchronize(nextRoots);
      setMessage(`${path} is indexed locally.`);
    } finally {
      setChoosing(false);
    }
  };

  const rebuildIndex = async () => {
    setIndexBusy(true);
    try {
      await synchronize();
    } finally {
      setIndexBusy(false);
    }
  };

  const deleteIndex = async () => {
    if (!window.confirm('Delete Lumen\'s local index? Your files will not be changed.')) return;
    setIndexBusy(true);
    try {
      const status = await nativeAiService.deleteIndex();
      setMessage(status.message);
    } finally {
      setIndexBusy(false);
    }
  };

  return (
    <SettingsPage>
      <div {...stylex.props(styles.toolbar)}>
        <LumenText tone="secondary">{roots.length} {roots.length === 1 ? 'root' : 'roots'}</LumenText>
        <div {...stylex.props(styles.actions)}>
          <LumenButton isDisabled={indexBusy || roots.length === 0} size="small" onPress={rebuildIndex}>
            {indexBusy ? 'Working…' : 'Rebuild index'}
          </LumenButton>
          <LumenButton isDisabled={indexBusy} size="small" variant="danger" onPress={deleteIndex}>
            Delete index
          </LumenButton>
          <LumenButton aria-label="Add root" isDisabled={choosing} size="small" variant="primary" onPress={addRoot}>
            <FolderOpenIcon aria-hidden="true" size={16} />
            {choosing ? 'Choosing…' : 'Add root'}
          </LumenButton>
        </div>
      </div>
      {message ? <SettingsCallout>{message}</SettingsCallout> : null}
      <SettingSection title="Indexed search directories" description="Content stays local unless cloud enrichment is enabled explicitly for that root.">
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
            cloudEnrichment={cloudEnrichedRootIds.includes(root.id)}
            key={root.id}
            root={root}
            onCloudEnrichmentChange={(enabled) => {
              const nextIds = enabled
                ? [...new Set([...cloudEnrichedRootIds, root.id])]
                : cloudEnrichedRootIds.filter((id) => id !== root.id);
              void updateAi({cloudEnrichedRootIds: nextIds}).then(() => synchronize(roots, nextIds));
            }}
            onChange={(next) => {
              const nextRoots = roots.map((item) => item.id === root.id ? next : item);
              void setRoots(nextRoots).then(() => synchronize(nextRoots));
            }}
            onRemove={() => {
              const nextRoots = roots.filter((item) => item.id !== root.id);
              const nextIds = cloudEnrichedRootIds.filter((id) => id !== root.id);
              void Promise.all([setRoots(nextRoots), updateAi({cloudEnrichedRootIds: nextIds})])
                .then(() => synchronize(nextRoots, nextIds));
            }}
          />
        ))}
      </SettingSection>
    </SettingsPage>
  );
}
