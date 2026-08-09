import {invoke} from '@tauri-apps/api/core';
import {listen, type UnlistenFn} from '@tauri-apps/api/event';

import {BrowserWindowService} from './browser-window-service';
import {
  WindowService,
  windowStateEventSchema,
  type WindowMode,
  type WindowStateEvent,
} from './window-service';

export class TauriWindowService extends WindowService {
  private listenerGeneration = 0;
  private listenerRetry = 0;
  private listenerRetryCount = 0;
  private nativeUnlisten: UnlistenFn | null = null;

  protected async performShow(mode: WindowMode): Promise<WindowStateEvent> {
    const event = windowStateEventSchema.parse(
      await invoke<unknown>('show_lumen_window', {mode}),
    );
    if (!event.visible || event.mode !== mode || event.source !== 'command') {
      throw new Error('The native window returned an unexpected show state.');
    }
    return event;
  }

  protected async performHide(): Promise<WindowStateEvent> {
    const event = windowStateEventSchema.parse(
      await invoke<unknown>('hide_lumen_window'),
    );
    if (event.visible || event.source !== 'command') {
      throw new Error('The native window returned an unexpected hidden state.');
    }
    return event;
  }

  async focusInput(): Promise<void> {
    await invoke('focus_lumen_input');
  }

  async setShortcut(accelerator: string): Promise<void> {
    await invoke('set_lumen_shortcut', {accelerator});
  }

  protected onFirstSubscriber() {
    this.listenerRetryCount = 0;
    this.registerNativeListener();
  }

  private registerNativeListener() {
    const generation = ++this.listenerGeneration;
    void listen<unknown>('lumen://window-state', ({payload}) => {
      const event = windowStateEventSchema.safeParse(payload);
      if (event.success) this.publishNativeState(event.data);
    }).then((unlisten) => {
      if (generation !== this.listenerGeneration) {
        unlisten();
        return;
      }
      this.listenerRetryCount = 0;
      this.nativeUnlisten = unlisten;
    }).catch(() => {
      if (generation !== this.listenerGeneration || this.listenerRetryCount >= 1) return;
      this.listenerRetryCount += 1;
      this.listenerRetry = window.setTimeout(() => {
        if (generation === this.listenerGeneration) this.registerNativeListener();
      }, 100);
    });
  }

  protected onLastSubscriber() {
    this.listenerGeneration += 1;
    window.clearTimeout(this.listenerRetry);
    this.listenerRetry = 0;
    this.listenerRetryCount = 0;
    this.nativeUnlisten?.();
    this.nativeUnlisten = null;
  }
}

export function createWindowService(): WindowService {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    ? new TauriWindowService()
    : new BrowserWindowService();
}
