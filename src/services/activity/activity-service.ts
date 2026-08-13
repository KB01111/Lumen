import {invoke as tauriInvoke} from '@tauri-apps/api/core';
import {z} from 'zod';

import type {ActivityMode} from '../../features/activity/activity.types';

type InvokeCommand = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

const activitySnapshotSchema = z.object({
  mode: z.enum(['indexing', 'gaming', 'fullscreen', 'cinema', 'battery', 'user']),
  backgroundPolicy: z.enum(['normal', 'metadataOnly', 'paused']),
  foregroundIdentity: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  fullscreen: z.boolean(),
  onBattery: z.boolean(),
});

const identityHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const executableIdentitySchema = z.object({
  fileName: z.string().min(1),
  identityHash: identityHashSchema,
});

export const activityPolicySchema = z.object({
  detectGames: z.boolean(),
  detectFullscreen: z.boolean(),
  allowDuringVideo: z.boolean(),
  cinemaMetadataOnly: z.boolean(),
  pauseOnBattery: z.boolean(),
  resumeDelaySeconds: z.number().int().min(0).max(600),
  gameIdentities: z.array(identityHashSchema),
  overrides: z.array(z.object({
    identityHash: identityHashSchema,
    policy: z.enum(['automatic', 'pause', 'cinema', 'allow']),
  })),
});

export type ActivitySnapshot = z.infer<typeof activitySnapshotSchema>;
export type ActivityPolicy = z.infer<typeof activityPolicySchema>;
export type ExecutableIdentity = z.infer<typeof executableIdentitySchema>;

export interface ActivityService {
  status(): Promise<ActivitySnapshot>;
  setUserPause(paused: boolean): Promise<ActivitySnapshot>;
  setPolicy(policy: ActivityPolicy): Promise<ActivitySnapshot>;
  chooseExecutable(): Promise<ExecutableIdentity | null>;
}

export class TauriActivityService implements ActivityService {
  constructor(private readonly invoke: InvokeCommand = tauriInvoke) {}

  async status() {
    return activitySnapshotSchema.parse(await this.invoke('get_activity_status'));
  }

  async setUserPause(paused: boolean) {
    return activitySnapshotSchema.parse(await this.invoke('set_user_pause', {paused}));
  }

  async setPolicy(policy: ActivityPolicy) {
    return activitySnapshotSchema.parse(await this.invoke('set_activity_policy', {
      policy: activityPolicySchema.parse(policy),
    }));
  }

  async chooseExecutable() {
    return executableIdentitySchema.nullable().parse(await this.invoke('choose_activity_executable'));
  }
}

class BrowserActivityService implements ActivityService {
  async status(): Promise<ActivitySnapshot> {
    return {
      mode: 'indexing',
      backgroundPolicy: 'normal',
      foregroundIdentity: null,
      fullscreen: false,
      onBattery: false,
    };
  }

  async setUserPause(paused: boolean): Promise<ActivitySnapshot> {
    return {
      ...await this.status(),
      mode: paused ? 'user' : 'indexing',
      backgroundPolicy: paused ? 'paused' : 'normal',
    };
  }

  async setPolicy(): Promise<ActivitySnapshot> {
    return this.status();
  }

  async chooseExecutable(): Promise<ExecutableIdentity | null> {
    return null;
  }
}

export function createActivityService(): ActivityService {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    ? new TauriActivityService()
    : new BrowserActivityService();
}

export function toActivityMode(mode: ActivitySnapshot['mode']): ActivityMode {
  return mode;
}
