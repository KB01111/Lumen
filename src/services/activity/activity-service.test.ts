import {describe, expect, it, vi} from 'vitest';

import {TauriActivityService} from './activity-service';

describe('TauriActivityService', () => {
  it('validates secret-free native activity snapshots', async () => {
    const invoke = vi.fn(async () => ({
      mode: 'fullscreen',
      backgroundPolicy: 'paused',
      foregroundIdentity: 'a'.repeat(64),
      fullscreen: true,
      onBattery: false,
    }));
    const service = new TauriActivityService(invoke);

    await expect(service.status()).resolves.toMatchObject({
      mode: 'fullscreen',
      backgroundPolicy: 'paused',
      fullscreen: true,
    });
    expect(invoke).toHaveBeenCalledWith('get_activity_status');
  });

  it('rejects native snapshots that expose executable paths', async () => {
    const service = new TauriActivityService(async () => ({
      mode: 'gaming',
      backgroundPolicy: 'paused',
      foregroundIdentity: 'C:\\Games\\private.exe',
      fullscreen: true,
      onBattery: false,
    }));

    await expect(service.status()).rejects.toThrow();
  });

  it('sends a closed policy DTO and validates executable selections', async () => {
    const invoke = vi.fn(async (command: string) => command === 'choose_activity_executable'
      ? {fileName: 'game.exe', identityHash: 'b'.repeat(64)}
      : {
          mode: 'gaming',
          backgroundPolicy: 'paused',
          foregroundIdentity: 'b'.repeat(64),
          fullscreen: true,
          onBattery: false,
        });
    const service = new TauriActivityService(invoke);
    const policy = {
      detectGames: true,
      detectFullscreen: true,
      allowDuringVideo: false,
      cinemaMetadataOnly: true,
      pauseOnBattery: true,
      resumeDelaySeconds: 30,
      gameIdentities: ['b'.repeat(64)],
      overrides: [{identityHash: 'a'.repeat(64), policy: 'allow' as const}],
    };

    await expect(service.setPolicy(policy)).resolves.toMatchObject({mode: 'gaming'});
    await expect(service.chooseExecutable()).resolves.toEqual({
      fileName: 'game.exe',
      identityHash: 'b'.repeat(64),
    });
    expect(invoke).toHaveBeenCalledWith('set_activity_policy', {policy});
    expect(invoke).toHaveBeenCalledWith('choose_activity_executable');
  });
});
