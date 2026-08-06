import {useEffect, useState} from 'react';

import {DatabaseIcon, ExportIcon, ShieldCheckIcon, TrashIcon} from '@phosphor-icons/react';

import {LumenButton} from '../../../design-system/primitives/LumenButton';
import {LumenText} from '../../../design-system/primitives/LumenText';
import {isNativeRuntime, nativeAiService} from '../../../services/ai/native-ai-service';
import type {SearchService} from '../../../services/search/search-service';
import {useAppearanceStore} from '../../../state/appearance.store';
import {useDiagnosticsStore} from '../../diagnostics/diagnostics.store';
import {useSearchHistoryStore} from '../../launcher/search-history.store';
import {ConfirmationDialog} from '../components/ConfirmationDialog';
import {SettingRow} from '../components/SettingRow';
import {SettingSection} from '../components/SettingSection';
import {LumenSwitch} from '../components/SettingsControls';
import {SettingsCallout, SettingsPage} from '../components/SettingsPage';
import {StatusBadge} from '../components/StatusBadge';
import {useSettingsStore} from '../settings.store';

function rootSummary(paths: string[]) {
  if (paths.length === 0) return 'No local roots selected';
  const names = paths.map((path) => {
    const segments = path.split(/[\\/]/).filter(Boolean);
    return segments[segments.length - 1] ?? 'Local folder';
  });
  return names.length <= 2 ? names.join(', ') : `${names.length} local folders`;
}

interface PageNotice {
  text: string;
  tone: 'info' | 'error';
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function PrivacyPage({
  searchService,
}: {
  searchService?: Pick<SearchService, 'invalidateIndex'>;
}) {
  const privacy = useSettingsStore((state) => state.privacy);
  const cloudEnrichedRootIds = useSettingsStore((state) => state.ai.cloudEnrichedRootIds);
  const roots = useSettingsStore((state) => state.roots);
  const updatePrivacy = useSettingsStore((state) => state.updatePrivacy);
  const setPreview = useAppearanceStore((state) => state.setPreview);
  const prepareExport = useDiagnosticsStore((state) => state.prepareExport);
  const historyEntries = useSearchHistoryStore((state) => state.entries);
  const historyHydrated = useSearchHistoryStore((state) => state.hydrated);
  const hydrateHistory = useSearchHistoryStore((state) => state.hydrate);
  const clearHistory = useSearchHistoryStore((state) => state.clear);
  const [notice, setNotice] = useState<PageNotice>();
  const [indexBusy, setIndexBusy] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const nativeAvailable = isNativeRuntime();

  useEffect(() => {
    void hydrateHistory();
  }, [hydrateHistory]);

  const togglePreviews = (previewsEnabled: boolean) => {
    void updatePrivacy({previewsEnabled});
    void setPreview(previewsEnabled ? 'automatic' : 'never');
  };

  const deleteIndex = async () => {
    if (!nativeAvailable) {
      setNotice({
        text: 'Local index deletion is available only in the native Windows app.',
        tone: 'error',
      });
      return;
    }

    setIndexBusy(true);
    setNotice(undefined);
    try {
      const status = await nativeAiService.deleteIndex();
      try {
        searchService?.invalidateIndex?.();
        setNotice({text: status.message, tone: 'info'});
      } catch (error) {
        setNotice({
          text: `The local index was deleted, but the active search cache could not be refreshed: ${errorMessage(error)}`,
          tone: 'error',
        });
      }
    } catch (error) {
      setNotice({text: `The local index could not be deleted: ${errorMessage(error)}`, tone: 'error'});
    } finally {
      setIndexBusy(false);
    }
  };

  const deleteHistory = async () => {
    setHistoryBusy(true);
    setNotice(undefined);
    const cleared = await clearHistory();
    setHistoryBusy(false);
    setNotice(cleared
      ? {text: 'Local search history cleared.', tone: 'info'}
      : {text: 'The local search history could not be cleared. Existing history was kept.', tone: 'error'});
  };

  return (
    <SettingsPage>
      <SettingsCallout>
        <ShieldCheckIcon aria-hidden="true" size={16} /> Lumen search data stays on this PC. Cloud provider consent is separate and off by default.
      </SettingsCallout>
      {notice ? <SettingsCallout tone={notice.tone}>{notice.text}</SettingsCallout> : null}
      <SettingSection title="Local data">
        <SettingRow label="Local-only search" description="Filenames, previews, history, and development adapter results remain local." status={<StatusBadge tone="success">On device</StatusBadge>}>
          <ShieldCheckIcon aria-hidden="true" size={20} />
        </SettingRow>
        <SettingRow label="Indexed root summary" description="Only folders you explicitly chose can be traversed.">
          <LumenText tone="secondary" variant="meta">{rootSummary(roots.map((root) => root.path))}</LumenText>
        </SettingRow>
        <SettingRow label="Search history" description={historyHydrated
          ? `${historyEntries.length} local ${historyEntries.length === 1 ? 'entry' : 'entries'}, recorded only after successful file or folder opens.`
          : 'Loading local history…'}>
          <ConfirmationDialog
            confirmLabel={`Clear ${historyEntries.length} history entries`}
            description="This removes the locally stored recalled queries. Indexed files are not affected."
            title="Clear search history?"
            onConfirm={() => void deleteHistory()}
          >
            <LumenButton aria-label="Clear search history" isDisabled={!historyHydrated || historyEntries.length === 0 || historyBusy} size="small" variant="quiet">
              <TrashIcon aria-hidden="true" size={14} /> {historyBusy ? 'Clearing…' : 'Clear'}
            </LumenButton>
          </ConfirmationDialog>
        </SettingRow>
        <SettingRow
          label="Local index"
          description={nativeAvailable
            ? 'Delete generated local index data without changing source files.'
            : 'Index deletion requires the native Windows app and is unavailable in the browser.'}
          status={<StatusBadge tone={nativeAvailable ? 'success' : 'neutral'}>
            {nativeAvailable ? 'On device' : 'Unavailable'}
          </StatusBadge>}
        >
          <ConfirmationDialog
            confirmLabel="Delete local index data"
            description="This removes Lumen's generated local index data. Your source files are not changed."
            title="Delete the local index?"
            onConfirm={() => void deleteIndex()}
          >
            <LumenButton isDisabled={!nativeAvailable || indexBusy} size="small" variant="danger">
              <DatabaseIcon aria-hidden="true" size={14} /> {indexBusy ? 'Deleting…' : 'Delete index'}
            </LumenButton>
          </ConfirmationDialog>
        </SettingRow>
      </SettingSection>
      <SettingSection title="Preview and cloud analysis">
        <SettingRow label="File previews" description="Disable all text, image, and metadata preview requests.">
          <LumenSwitch aria-label="File previews" isSelected={privacy.previewsEnabled} onChange={togglePreviews} />
        </SettingRow>
        <SettingRow
          label="OCR analysis"
          description="With cloud consent and a provider credential, images are sent through the confined cloud route only for roots with cloud enrichment enabled. Extracted text is stored in the local index."
          status={<StatusBadge tone={cloudEnrichedRootIds.length > 0 ? 'info' : 'neutral'}>{cloudEnrichedRootIds.length > 0 ? 'Opted in' : 'Off'}</StatusBadge>}
        >
          <LumenText tone="secondary" variant="meta">Per root</LumenText>
        </SettingRow>
        <SettingRow
          label="Audio transcription"
          description="With cloud consent and a provider credential, audio is sent through the confined cloud route only for opted-in roots. Transcripts are stored in the local index."
          status={<StatusBadge tone={cloudEnrichedRootIds.length > 0 ? 'info' : 'neutral'}>{cloudEnrichedRootIds.length > 0 ? 'Opted in' : 'Off'}</StatusBadge>}
        >
          <LumenText tone="secondary" variant="meta">Per root</LumenText>
        </SettingRow>
        <SettingRow label="Image understanding" description="Image analysis is not implemented in phase one." status={<StatusBadge tone="neutral">Future</StatusBadge>}>
          <LumenSwitch aria-label="Image understanding" isDisabled isSelected={false} />
        </SettingRow>
      </SettingSection>
      <SettingSection title="Diagnostic export">
        <SettingRow label="Sanitized support snapshot" description="Exports versions, states, and timing samples. Local paths, prompts, and secret fields are redacted.">
          <ConfirmationDialog
            confirmLabel="Prepare sanitized export"
            confirmVariant="primary"
            description="Review the generated JSON before sharing it. Lumen removes local paths and known secret-bearing fields."
            title="Prepare diagnostic export?"
            onConfirm={() => {
              const payload = prepareExport();
              setNotice({text: `${payload.filename} is prepared in memory for review.`, tone: 'info'});
            }}
          >
            <LumenButton size="small"><ExportIcon aria-hidden="true" size={14} /> Export</LumenButton>
          </ConfirmationDialog>
        </SettingRow>
      </SettingSection>
    </SettingsPage>
  );
}
