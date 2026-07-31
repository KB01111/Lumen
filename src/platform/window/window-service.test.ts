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
