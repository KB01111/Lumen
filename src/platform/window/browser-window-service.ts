import {
  windowGeometry,
  type WindowGeometry,
  type WindowMode,
  type WindowService,
} from './window-service';

export interface BrowserWindowSnapshot extends WindowGeometry {
  mode: WindowMode;
  visible: boolean;
  inputFocusRequests: number;
  shortcut: string | null;
}

export class BrowserWindowService implements WindowService {
  private state: BrowserWindowSnapshot = {
    mode: 'collapsed',
    visible: false,
    inputFocusRequests: 0,
    shortcut: null,
    ...windowGeometry.collapsed,
  };

  async show(mode: WindowMode): Promise<void> {
    this.state = {
      ...this.state,
      ...windowGeometry[mode],
      mode,
      visible: true,
    };
  }

  async hide(): Promise<void> {
    this.state = {...this.state, visible: false};
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

