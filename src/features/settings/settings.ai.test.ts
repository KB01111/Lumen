import {beforeEach, describe, expect, it} from 'vitest';

import {defaultSettings, parseSettings} from './settings.schema';
import {useSettingsStore} from './settings.store';

describe('AI runtime settings', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useSettingsStore.getState().reset();
  });

  it('upgrades an older settings payload to Auto without losing existing settings', () => {
    const parsed = parseSettings({...defaultSettings, ai: undefined});

    expect(parsed.ai).toEqual({
      runtimeMode: 'auto',
      keepLocalWarm: false,
      cloudAnswerConsent: false,
      cloudEnrichedRootIds: [],
    });
    expect(parsed.general.shortcut).toBe(defaultSettings.general.shortcut);
  });

  it('persists the selected runtime mode per device', async () => {
    await useSettingsStore.getState().updateAi({runtimeMode: 'local'});

    const saved = JSON.parse(window.localStorage.getItem('lumen-management-settings') ?? '{}');
    expect(saved.ai.runtimeMode).toBe('local');
    expect(useSettingsStore.getState().ai.runtimeMode).toBe('local');
  });

  it('fails closed when an existing AI settings payload predates cloud answer consent', () => {
    const parsed = parseSettings({
      ...defaultSettings,
      ai: {
        runtimeMode: 'cloud',
        keepLocalWarm: false,
        cloudEnrichedRootIds: [],
      },
    });

    expect(parsed.ai.cloudAnswerConsent).toBe(false);
  });

  it('persists explicit cloud answer consent per device', async () => {
    await useSettingsStore.getState().updateAi({cloudAnswerConsent: true});

    const saved = JSON.parse(window.localStorage.getItem('lumen-management-settings') ?? '{}');
    expect(saved.ai.cloudAnswerConsent).toBe(true);
  });
});

