import {useEffect, useRef, useState} from 'react';

import {createWindowService} from '../../../platform/window/tauri-window-service';
import type {GeneralWindowPreferences, WindowService} from '../../../platform/window/window-service';
import {SettingRow} from '../components/SettingRow';
import {SettingSection} from '../components/SettingSection';
import {LumenSelect, LumenSwitch} from '../components/SettingsControls';
import {SettingsCallout, SettingsPage} from '../components/SettingsPage';
import {ShortcutRecorder} from '../components/ShortcutRecorder';
import {useSettingsStore} from '../settings.store';

const defaultWindowService = createWindowService();

export function GeneralPage({windowService = defaultWindowService}: {windowService?: WindowService}) {
  const general = useSettingsStore((state) => state.general);
  const hydrated = useSettingsStore((state) => state.hydrated);
  const updateGeneral = useSettingsStore((state) => state.updateGeneral);
  const [shortcutError, setShortcutError] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [mutationBusy, setMutationBusy] = useState(false);
  const reconciled = useRef(false);
  const mutationInFlight = useRef(false);

  const preferencesFor = (value = general): GeneralWindowPreferences => ({
    launchAtStartup: value.launchAtStartup,
    monitorBehavior: value.monitorBehavior,
    closeBehavior: value.closeBehavior,
  });

  useEffect(() => {
    if (!hydrated || reconciled.current) return;
    reconciled.current = true;
    void windowService.applyGeneralPreferences({
      launchAtStartup: general.launchAtStartup,
      monitorBehavior: general.monitorBehavior,
      closeBehavior: general.closeBehavior,
    }).catch((error: unknown) => {
      setGeneralError(`Windows could not apply your startup and window preferences: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, [general.closeBehavior, general.launchAtStartup, general.monitorBehavior, hydrated, windowService]);

  const updateNativePreference = async (
    patch: Partial<typeof general>,
    description: string,
  ) => {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setMutationBusy(true);
    const previous = useSettingsStore.getState().general;
    const next = {...previous, ...patch};
    setGeneralError('');
    try {
      await windowService.applyGeneralPreferences(preferencesFor(next));
    } catch (error) {
      setGeneralError(`Windows could not apply ${description}. Your previous setting remains active: ${error instanceof Error ? error.message : String(error)}`);
      mutationInFlight.current = false;
      setMutationBusy(false);
      return;
    }
    if (await updateGeneral(patch)) {
      mutationInFlight.current = false;
      setMutationBusy(false);
      return;
    }

    const rollback = Object.fromEntries(
      Object.keys(patch).map((key) => [key, previous[key as keyof typeof previous]]),
    ) as Partial<typeof general>;
    useSettingsStore.setState((state) => ({general: {...state.general, ...rollback}}));
    try {
      await windowService.applyGeneralPreferences(preferencesFor(useSettingsStore.getState().general));
      setGeneralError(`${description} was not saved, so Windows was restored to your previous setting.`);
    } catch (error) {
      setGeneralError(`${description} was not saved and Windows could not be restored: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      mutationInFlight.current = false;
      setMutationBusy(false);
    }
  };

  const updateShortcut = async (shortcut: string) => {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setMutationBusy(true);
    const previous = useSettingsStore.getState().general.shortcut;
    setShortcutError('');
    try {
      await windowService.setShortcut(shortcut);
    } catch (error) {
      setShortcutError(`Windows could not register that shortcut. Your previous shortcut remains active: ${error instanceof Error ? error.message : String(error)}`);
      mutationInFlight.current = false;
      setMutationBusy(false);
      return;
    }
    if (await updateGeneral({shortcut})) {
      mutationInFlight.current = false;
      setMutationBusy(false);
      return;
    }

    useSettingsStore.setState((state) => ({general: {...state.general, shortcut: previous}}));
    try {
      await windowService.setShortcut(previous);
      setShortcutError('The shortcut was not saved, so Windows was restored to your previous shortcut.');
    } catch (error) {
      setShortcutError(`The shortcut was not saved and Windows could not be restored: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      mutationInFlight.current = false;
      setMutationBusy(false);
    }
  };

  const updateStoredPreference = async (patch: Partial<typeof general>, description: string) => {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setMutationBusy(true);
    const previous = useSettingsStore.getState().general;
    const saved = await updateGeneral(patch);
    if (!saved) {
      const rollback = Object.fromEntries(
        Object.keys(patch).map((key) => [key, previous[key as keyof typeof previous]]),
      ) as Partial<typeof general>;
      useSettingsStore.setState((state) => ({general: {...state.general, ...rollback}}));
      setGeneralError(`${description} was not saved. Your previous setting remains active.`);
    }
    mutationInFlight.current = false;
    setMutationBusy(false);
  };

  return (
    <SettingsPage>
      {generalError ? <SettingsCallout tone="error">{generalError}</SettingsCallout> : null}
      <SettingSection title="Startup" description="Choose when Lumen is ready without adding visual noise.">
        <SettingRow label="Launch at startup" description="Start Lumen quietly when you sign in to Windows.">
          <LumenSwitch
            aria-label="Launch at startup"
            isDisabled={mutationBusy}
            isSelected={general.launchAtStartup}
            onChange={(launchAtStartup) => void updateNativePreference({launchAtStartup}, 'Launch at startup')}
          />
        </SettingRow>
      </SettingSection>
      <SettingSection title="Launcher" description="Keyboard and window behavior shared by every search.">
        <SettingRow
          label="Global shortcut"
          description="Press the chord once to summon Lumen on the active monitor."
          error={shortcutError}
        >
          <ShortcutRecorder isDisabled={mutationBusy} value={general.shortcut} onChange={(shortcut) => void updateShortcut(shortcut)} onInvalid={setShortcutError} />
        </SettingRow>
        <SettingRow label="Open on" description="Follow your pointer and active application, or stay on the primary display.">
          <LumenSelect
            aria-label="Monitor behavior"
            isDisabled={mutationBusy}
            options={[
              {id: 'active', label: 'Active monitor'},
              {id: 'primary', label: 'Primary monitor'},
            ]}
            value={general.monitorBehavior}
            onChange={(monitorBehavior) => void updateNativePreference({monitorBehavior}, 'Monitor behavior')}
          />
        </SettingRow>
        <SettingRow label="Search history" description="Keep queries only after a successful file or folder open; use Up and Down to recall them locally.">
          <LumenSwitch
            aria-label="Search history"
            isDisabled={mutationBusy}
            isSelected={general.historyEnabled}
            onChange={(historyEnabled) => void updateStoredPreference({historyEnabled}, 'Search history')}
          />
        </SettingRow>
        <SettingRow label="When the launcher closes" description="Hiding keeps the warm interface ready for the next shortcut.">
          <LumenSelect
            aria-label="Launcher close behavior"
            isDisabled={mutationBusy}
            options={[
              {id: 'hide', label: 'Hide and stay ready'},
              {id: 'quit', label: 'Quit Lumen'},
            ]}
            value={general.closeBehavior}
            onChange={(closeBehavior) => void updateNativePreference({closeBehavior}, 'Launcher close behavior')}
          />
        </SettingRow>
      </SettingSection>
    </SettingsPage>
  );
}
