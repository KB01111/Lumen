import {invoke} from '@tauri-apps/api/core';
import {listen, type UnlistenFn} from '@tauri-apps/api/event';
import {z} from 'zod';

const provisioningModelStatusSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  state: z.enum(['missing', 'downloading', 'ready']),
});

export const provisioningStatusSchema = z.object({
  profileId: z.literal('local-core'),
  label: z.string().min(1),
  version: z.string().min(1),
  installedVersion: z.string().min(1).nullable(),
  state: z.enum(['missing', 'updateAvailable', 'working', 'ready', 'failed', 'cancelled']),
  phase: z.string().min(1),
  downloadedBytes: z.number().int().nonnegative(),
  totalBytes: z.number().int().positive(),
  requiredDiskBytes: z.number().int().positive(),
  progress: z.number().int().min(0).max(100),
  canDownload: z.boolean(),
  canUpdate: z.boolean(),
  canCancel: z.boolean(),
  detail: z.string().nullable(),
  models: z.array(provisioningModelStatusSchema),
});

export type ProvisioningStatus = z.infer<typeof provisioningStatusSchema>;

export interface ProvisioningService {
  status(): Promise<ProvisioningStatus>;
  start(profileId: 'local-core'): Promise<ProvisioningStatus>;
  cancel(): Promise<ProvisioningStatus>;
  subscribe(listener: (status: ProvisioningStatus) => void): Promise<UnlistenFn>;
}

class NativeProvisioningService implements ProvisioningService {
  async status() {
    return provisioningStatusSchema.parse(await invoke('get_provisioning_status'));
  }

  async start(profileId: 'local-core') {
    return provisioningStatusSchema.parse(await invoke('start_provisioning', {profileId}));
  }

  async cancel() {
    return provisioningStatusSchema.parse(await invoke('cancel_provisioning'));
  }

  async subscribe(listener: (status: ProvisioningStatus) => void) {
    return listen<unknown>('lumen://provisioning-progress', ({payload}) => {
      const parsed = provisioningStatusSchema.safeParse(payload);
      if (parsed.success) listener(parsed.data);
    });
  }
}

export const provisioningService: ProvisioningService = new NativeProvisioningService();
