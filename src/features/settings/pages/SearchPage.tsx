import {LumenText} from '../../../design-system/primitives/LumenText';
import {SettingRow} from '../components/SettingRow';
import {SettingSection} from '../components/SettingSection';
import {LumenCheckbox, LumenSelect, LumenSlider} from '../components/SettingsControls';
import {SettingsPage} from '../components/SettingsPage';
import type {SearchSettings} from '../settings.schema';
import {useSettingsStore} from '../settings.store';

const scopes = [
  ['all', 'All'],
  ['files', 'Files'],
  ['folders', 'Folders'],
  ['documents', 'Documents'],
  ['code', 'Code'],
  ['images', 'Images'],
] as const;

export function SearchPage() {
  const search = useSettingsStore((state) => state.search);
  const updateSearch = useSettingsStore((state) => state.updateSearch);

  const toggleScope = (scope: SearchSettings['enabledScopes'][number], selected: boolean) => {
    const enabledScopes = selected
      ? [...new Set([...search.enabledScopes, scope])]
      : search.enabledScopes.filter((item) => item !== scope);
    if (enabledScopes.length > 0) {
      void updateSearch({enabledScopes});
    }
  };

  return (
    <SettingsPage>
      <SettingSection title="Result scopes" description="Choose which scope tabs stay available in the launcher.">
        <div className="grid grid-cols-2 gap-2 p-5">
          {scopes.map(([id, label]) => (
            <LumenCheckbox
              key={id}
              isSelected={search.enabledScopes.includes(id)}
              onChange={(selected) => toggleScope(id, selected)}
            >
              {label}
            </LumenCheckbox>
          ))}
        </div>
      </SettingSection>
      <SettingSection title="Ranking" description="Tune exact filename and recent-item emphasis for the local adapter.">
        <SettingRow label="Filename priority" description="Higher values favor direct filename matches before path fragments.">
          <LumenSlider label="Filename priority" value={search.filenamePriority} onChange={(filenamePriority) => void updateSearch({filenamePriority})} />
        </SettingRow>
        <SettingRow label="Recency preference">
          <LumenSelect
            aria-label="Recency preference"
            options={[{id: 'low', label: 'Low'}, {id: 'balanced', label: 'Balanced'}, {id: 'high', label: 'High'}]}
            value={search.recency}
            onChange={(recency) => void updateSearch({recency})}
          />
        </SettingRow>
      </SettingSection>
      <LumenText tone="tertiary" variant="caption">Exact filename and folder search remains available with every AI provider off.</LumenText>
    </SettingsPage>
  );
}
