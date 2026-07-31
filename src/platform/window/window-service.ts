export type WindowMode =
  | 'collapsed'
  | 'expanded'
  | 'onboarding'
  | 'settings'
  | 'gallery';

export interface WindowGeometry {
  width: number;
  height: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  resizable: boolean;
}

export const windowGeometry = {
  collapsed: {
    width: 700,
    height: 66,
    minWidth: 620,
    maxWidth: 760,
    minHeight: 66,
    maxHeight: 66,
    resizable: false,
  },
  expanded: {
    width: 800,
    height: 540,
    minWidth: 720,
    maxWidth: 960,
    minHeight: 320,
    maxHeight: 600,
    resizable: true,
  },
  onboarding: {
    width: 800,
    height: 600,
    minWidth: 720,
    maxWidth: 960,
    minHeight: 560,
    maxHeight: 720,
    resizable: true,
  },
  settings: {
    width: 880,
    height: 600,
    minWidth: 760,
    maxWidth: 1080,
    minHeight: 520,
    maxHeight: 760,
    resizable: true,
  },
  gallery: {
    width: 1120,
    height: 760,
    minWidth: 880,
    maxWidth: 1440,
    minHeight: 640,
    maxHeight: 960,
    resizable: true,
  },
} as const satisfies Record<WindowMode, WindowGeometry>;

export interface WindowService {
  show(mode: WindowMode): Promise<void>;
  hide(): Promise<void>;
  focusInput(): Promise<void>;
  setShortcut(accelerator: string): Promise<void>;
}

