import {
  WindowService,
  windowGeometry,
  type WindowGeometry,
  type WindowMode,
  type WindowStateEvent,
} from './window-service';

export interface BrowserWindowSnapshot extends WindowGeometry {
  mode: WindowMode;
  visible: boolean;
  inputFocusRequests: number;
  shortcut: string | null;
}

export class BrowserWindowService extends WindowService {
  private state: BrowserWindowSnapshot = {
    mode: 'collapsed',
    visible: false,
    inputFocusRequests: 0,
    shortcut: null,
    ...windowGeometry.collapsed,
  };

  protected async performShow(mode: WindowMode): Promise<WindowStateEvent> {
    this.state = {
      ...this.state,
      ...windowGeometry[mode],
      mode,
      visible: true,
    };
    return {mode, source: 'command', visible: true};
  }

  protected async performHide(): Promise<WindowStateEvent> {
    this.state = {...this.state, visible: false};
    return {mode: null, source: 'command', visible: false};
  }

  async focusInput(): Promise<void> {
    this.state = {
      ...this.state,
      inputFocusRequests: this.state.inputFocusRequests + 1,
    };
  }

  async setShortcut(accelerator: string): Promise<void> {
    this.state = {...this.state, shortcut: accelerator};
  }

  snapshot(): BrowserWindowSnapshot {
    return {...this.state};
  }
}

