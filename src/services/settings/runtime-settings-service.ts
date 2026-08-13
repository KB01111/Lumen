import {invoke} from '@tauri-apps/api/core';
import {disable, enable} from '@tauri-apps/plugin-autostart';

import type {GeneralSettings} from '../../features/settings/settings.schema';

export interface RuntimeSettingsService {
  setLaunchAtStartup(enabled: boolean): Promise<void>;
  setMonitorBehavior(behavior: GeneralSettings['monitorBehavior']): Promise<void>;
  setCloseBehavior(behavior: GeneralSettings['closeBehavior']): Promise<void>;
  setHistoryEnabled(enabled: boolean): Promise<void>;
}

class BrowserRuntimeSettingsService implements RuntimeSettingsService {
  async setLaunchAtStartup() {}
  async setMonitorBehavior() {}
  async setCloseBehavior() {}
  async setHistoryEnabled() {}
}

class TauriRuntimeSettingsService implements RuntimeSettingsService {
  async setLaunchAtStartup(enabled: boolean) {
    await (enabled ? enable() : disable());
  }

  async setMonitorBehavior(behavior: GeneralSettings['monitorBehavior']) {
    await invoke('set_monitor_behavior', {behavior});
  }

  async setCloseBehavior(behavior: GeneralSettings['closeBehavior']) {
    await invoke('set_close_behavior', {behavior});
  }

  async setHistoryEnabled(enabled: boolean) {
    await invoke('set_history_enabled', {enabled});
  }
}

export function createRuntimeSettingsService(): RuntimeSettingsService {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    ? new TauriRuntimeSettingsService()
    : new BrowserRuntimeSettingsService();
}
