import {useState} from 'react';

import {LumenUiIcon} from '../../../design-system/icons/LumenUiIcon';
import {LumenButton} from '../../../design-system/primitives/LumenButton';
import {LumenText} from '../../../design-system/primitives/LumenText';
import {useAppearanceStore} from '../../../state/appearance.store';
import {useDiagnosticsStore} from '../../diagnostics/diagnostics.store';
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

export function PrivacyPage() {
  const privacy = useSettingsStore((state) => state.privacy);
  const roots = useSettingsStore((state) => state.roots);
  const updatePrivacy = useSettingsStore((state) => state.updatePrivacy);
  const setPreview = useAppearanceStore((state) => state.setPreview);
  const prepareExport = useDiagnosticsStore((state) => state.prepareExport);
  const [message, setMessage] = useState('');

  const togglePreviews = (previewsEnabled: boolean) => {
    void updatePrivacy({previewsEnabled});
    void setPreview(previewsEnabled ? 'automatic' : 'never');
  };

  return (
    <SettingsPage>
      <SettingsCallout>
        <LumenUiIcon name="privacy" size="small" /> Lumen search data stays on this PC. Cloud provider consent is separate and off by default.
      </SettingsCallout>
      {message ? <SettingsCallout>{message}</SettingsCallout> : null}
      <SettingSection title="Local data">
        <SettingRow label="Local-only search" description="Filenames, previews, history, and development adapter results remain local." status={<StatusBadge tone="success">On device</StatusBadge>}>
          <LumenUiIcon name="privacy" size="medium" />
        </SettingRow>
        <SettingRow label="Indexed root summary" description="Only folders you explicitly chose can be traversed.">
          <LumenText tone="secondary" variant="meta">{rootSummary(roots.map((root) => root.path))}</LumenText>
        </SettingRow>
        <SettingRow label="Search history" description={`${privacy.historyEntries} local ${privacy.historyEntries === 1 ? 'entry' : 'entries'}.`}>
          <ConfirmationDialog
            confirmLabel={`Clear ${privacy.historyEntries} history entries`}
            description="This removes local recent-query history. Indexed files are not affected."
            title="Clear search history?"
            onConfirm={() => {
              void updatePrivacy({historyEntries: 0});
              setMessage('Local search history cleared.');
            }}
          >
            <LumenButton aria-label="Clear search history" isDisabled={privacy.historyEntries === 0} size="small" variant="quiet">
              <LumenUiIcon name="delete" size="small" /> Clear
            </LumenButton>
          </ConfirmationDialog>
        </SettingRow>
        <SettingRow label="Local index" description="The production index does not exist in phase one; this action previews the future confirmation.">
          <ConfirmationDialog
            confirmLabel="Delete local index data"
            description="A future build will remove generated index data without deleting source files. No index is present in phase one."
            title="Delete the local index?"
            onConfirm={() => setMessage('Index deletion preview completed. No source files were changed.')}
          >
            <LumenButton size="small" variant="danger"><LumenUiIcon name="storage" size="small" /> Delete index</LumenButton>
          </ConfirmationDialog>
        </SettingRow>
      </SettingSection>
      <SettingSection title="Preview and future analysis">
        <SettingRow label="File previews" description="Disable all text, image, and metadata preview requests.">
          <LumenSwitch aria-label="File previews" isSelected={privacy.previewsEnabled} onChange={togglePreviews} />
        </SettingRow>
        <SettingRow label="OCR analysis" description="OCR is not implemented in phase one." status={<StatusBadge tone="neutral">Future</StatusBadge>}>
          <LumenSwitch aria-label="OCR analysis" isDisabled isSelected={false} />
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
              setMessage(`${payload.filename} is prepared in memory for review.`);
            }}
          >
            <LumenButton size="small"><LumenUiIcon name="download" size="small" /> Export</LumenButton>
          </ConfirmationDialog>
        </SettingRow>
      </SettingSection>
    </SettingsPage>
  );
}
