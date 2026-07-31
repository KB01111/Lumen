import {invoke} from '@tauri-apps/api/core';

import {BrowserWindowService} from './browser-window-service';
import type {WindowMode, WindowService} from './window-service';

export class TauriWindowService implements WindowService {
  async show(mode: WindowMode): Promise<void> {
    await invoke('show_lumen_window', {mode});
  }

  async hide(): Promise<void> {
    await invoke('hide_lumen_window');
  }

  async focusInput(): Promise<void> {
    await invoke('focus_lumen_input');
  }

  async setShortcut(accelerator: string): Promise<void> {
    await invoke('set_lumen_shortcut', {accelerator});
  }
}

export function createWindowService(): WindowService {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    ? new TauriWindowService()
    : new BrowserWindowService();
}
