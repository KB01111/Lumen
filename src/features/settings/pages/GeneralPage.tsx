import {useState} from 'react';

import {createWindowService} from '../../../platform/window/tauri-window-service';
import type {WindowService} from '../../../platform/window/window-service';
import {SettingRow} from '../components/SettingRow';
import {SettingSection} from '../components/SettingSection';
import {LumenSelect, LumenSwitch} from '../components/SettingsControls';
import {SettingsPage} from '../components/SettingsPage';
import {ShortcutRecorder} from '../components/ShortcutRecorder';
import {useSettingsStore} from '../settings.store';

const defaultWindowService = createWindowService();

export function GeneralPage({windowService = defaultWindowService}: {windowService?: WindowService}) {
  const general = useSettingsStore((state) => state.general);
  const updateGeneral = useSettingsStore((state) => state.updateGeneral);
  const [shortcutError, setShortcutError] = useState('');

  const updateShortcut = (shortcut: string) => {
    void updateGeneral({shortcut});
    void windowService.setShortcut(shortcut).catch(() => {
      setShortcutError('Windows could not register that shortcut. Your previous shortcut remains active.');
    });
  };

  return (
    <SettingsPage>
      <SettingSection title="Startup" description="Choose when Lumen is ready without adding visual noise.">
        <SettingRow label="Launch at startup" description="Start Lumen quietly when you sign in to Windows.">
          <LumenSwitch
            aria-label="Launch at startup"
            isSelected={general.launchAtStartup}
            onChange={(launchAtStartup) => void updateGeneral({launchAtStartup})}
          />
        </SettingRow>
      </SettingSection>
      <SettingSection title="Launcher" description="Keyboard and window behavior shared by every search.">
        <SettingRow
          label="Global shortcut"
          description="Press the chord once to summon Lumen on the active monitor."
          error={shortcutError}
        >
          <ShortcutRecorder value={general.shortcut} onChange={updateShortcut} onInvalid={setShortcutError} />
        </SettingRow>
        <SettingRow label="Open on" description="Follow your pointer and active application, or stay on the primary display.">
          <LumenSelect
            aria-label="Monitor behavior"
            options={[
              {id: 'active', label: 'Active monitor'},
              {id: 'primary', label: 'Primary monitor'},
            ]}
            value={general.monitorBehavior}
            onChange={(monitorBehavior) => void updateGeneral({monitorBehavior})}
          />
        </SettingRow>
        <SettingRow label="Search history" description="Keep recent queries locally for quick recall.">
          <LumenSwitch
            aria-label="Search history"
            isSelected={general.historyEnabled}
            onChange={(historyEnabled) => void updateGeneral({historyEnabled})}
          />
        </SettingRow>
        <SettingRow label="When the launcher closes" description="Hiding keeps the warm interface ready for the next shortcut.">
          <LumenSelect
            aria-label="Launcher close behavior"
            options={[
              {id: 'hide', label: 'Hide and stay ready'},
              {id: 'quit', label: 'Quit Lumen'},
            ]}
            value={general.closeBehavior}
            onChange={(closeBehavior) => void updateGeneral({closeBehavior})}
          />
        </SettingRow>
      </SettingSection>
    </SettingsPage>
  );
}
