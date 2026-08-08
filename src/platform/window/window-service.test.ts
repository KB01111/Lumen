import {describe, expect, it} from 'vitest';

import {BrowserWindowService} from './browser-window-service';
import {windowGeometry} from './window-service';

describe('window service', () => {
  it('uses controlled logical sizes for each window mode', async () => {
    const service = new BrowserWindowService();

    await service.show('collapsed');
    expect(service.snapshot()).toMatchObject({
      mode: 'collapsed',
      visible: true,
      width: 700,
      height: 66,
    });

    await service.show('expanded');
    expect(service.snapshot()).toMatchObject({
      mode: 'expanded',
      visible: true,
      width: 800,
      maxHeight: 600,
    });
  });

  it('keeps all management modes within the desktop workspace contract', () => {
    expect(Object.keys(windowGeometry)).toEqual([
      'collapsed',
      'expanded',
      'onboarding',
      'settings',
      'gallery',
    ]);
    expect(windowGeometry.settings).toMatchObject({width: 880, height: 600});
    expect(windowGeometry.gallery).toMatchObject({width: 1120, height: 760});
  });

  it('locks the native host geometry and non-resizable collapsed pill', () => {
    expect(windowGeometry).toEqual({
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
    });
  });

  it('records visibility, input focus, and shortcut changes in browser mode', async () => {
    const service = new BrowserWindowService();

    await service.show('onboarding');
    await service.focusInput();
    await service.setShortcut('Alt+Space');
    await service.hide();

    expect(service.snapshot()).toMatchObject({
      mode: 'onboarding',
      visible: false,
      inputFocusRequests: 1,
      shortcut: 'Alt+Space',
    });
  });
});
