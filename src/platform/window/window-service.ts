import {z} from 'zod';

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

const windowModeSchema = z.enum([
  'collapsed',
  'expanded',
  'onboarding',
  'settings',
  'gallery',
]);

export const windowStateEventSchema = z.discriminatedUnion('visible', [
  z.object({
    mode: z.null(),
    source: z.enum(['command', 'close']),
    visible: z.literal(false),
  }),
  z.object({
    mode: windowModeSchema,
    source: z.enum(['command', 'shortcut', 'secondInstance']),
    visible: z.literal(true),
  }),
]);

export type WindowStateEvent = z.infer<typeof windowStateEventSchema>;

type DesiredWindowState =
  | {mode: null; visible: false}
  | {mode: WindowMode; visible: true};

type ConfirmedWindowState = {
  mode: WindowMode | 'unknown';
  visible: boolean | 'unknown';
};

export interface WindowPresentationSnapshot {
  confirmed: Readonly<ConfirmedWindowState>;
  desired: Readonly<DesiredWindowState> | null;
}

interface RequestWaiter {
  reject(error: unknown): void;
  resolve(applied: boolean): void;
}

function stateMatches(confirmed: ConfirmedWindowState, desired: DesiredWindowState) {
  return confirmed.visible === desired.visible && (
    !desired.visible || confirmed.mode === desired.mode
  );
}

/**
 * Owns native transition ordering for one application window. Newer requests
 * supersede queued work, while an already-issued native call is allowed to
 * finish before the latest desired state is reconciled.
 */
export abstract class WindowService {
  private blockedGeneration: number | null = null;
  private confirmed: ConfirmedWindowState = {mode: 'unknown', visible: 'unknown'};
  private desired: DesiredWindowState | null = null;
  private externalRevision = 0;
  private generation = 0;
  private readonly listeners = new Set<(event: WindowStateEvent) => void>();
  private reconciling = false;
  private readonly waiters = new Map<number, RequestWaiter>();

  show(mode: WindowMode): Promise<boolean> {
    return this.request({mode, visible: true});
  }

  hide(): Promise<boolean> {
    return this.request({mode: null, visible: false});
  }

  subscribe(listener: (event: WindowStateEvent) => void): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.onFirstSubscriber();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.onLastSubscriber();
    };
  }

  presentationSnapshot(): WindowPresentationSnapshot {
    return {
      confirmed: {...this.confirmed},
      desired: this.desired ? {...this.desired} : null,
    };
  }

  abstract focusInput(): Promise<void>;
  abstract setShortcut(accelerator: string): Promise<void>;

  protected abstract performHide(): Promise<WindowStateEvent>;
  protected abstract performShow(mode: WindowMode): Promise<WindowStateEvent>;

  protected onFirstSubscriber() {}
  protected onLastSubscriber() {}

  protected publishNativeState(payload: unknown) {
    const event = windowStateEventSchema.parse(payload);
    this.externalRevision += 1;
    this.generation += 1;
    this.blockedGeneration = null;
    this.desired = event.visible
      ? {mode: event.mode, visible: true}
      : {mode: null, visible: false};
    this.confirmed = {
      mode: event.mode ?? this.confirmed.mode,
      visible: event.visible,
    };
    this.resolveSupersededWaiters();
    this.emit(event);
  }

  private request(desired: DesiredWindowState) {
    const generation = ++this.generation;
    this.desired = desired;
    this.blockedGeneration = null;
    this.resolveSupersededWaiters();
    const promise = new Promise<boolean>((resolve, reject) => {
      this.waiters.set(generation, {reject, resolve});
    });
    this.reconcile();
    return promise;
  }

  private resolveSupersededWaiters() {
    for (const [generation, waiter] of this.waiters) {
      if (generation < this.generation) {
        waiter.resolve(false);
        this.waiters.delete(generation);
      }
    }
  }

  private emit(event: WindowStateEvent) {
    for (const listener of this.listeners) listener(event);
  }

  private reconcile() {
    if (this.reconciling || !this.desired || this.blockedGeneration === this.generation) {
      return;
    }
    this.reconciling = true;
    void (async () => {
      try {
        while (this.desired && this.blockedGeneration !== this.generation) {
          const desired = this.desired;
          const generation = this.generation;
          if (stateMatches(this.confirmed, desired)) {
            this.waiters.get(generation)?.resolve(true);
            this.waiters.delete(generation);
            break;
          }

          const externalRevision = this.externalRevision;
          try {
            const event = windowStateEventSchema.parse(
              desired.visible
                ? await this.performShow(desired.mode)
                : await this.performHide(),
            );
            if (externalRevision !== this.externalRevision) {
              this.confirmed = {mode: 'unknown', visible: 'unknown'};
            } else {
              this.confirmed = {
                mode: event.mode ?? this.confirmed.mode,
                visible: event.visible,
              };
              if (generation === this.generation) this.emit(event);
            }
            this.waiters.get(generation)?.resolve(generation === this.generation);
            this.waiters.delete(generation);
          } catch (error) {
            this.confirmed = {mode: 'unknown', visible: 'unknown'};
            if (generation !== this.generation) {
              this.waiters.get(generation)?.resolve(false);
              this.waiters.delete(generation);
              continue;
            }
            this.blockedGeneration = generation;
            this.waiters.get(generation)?.reject(error);
            this.waiters.delete(generation);
            break;
          }
        }
      } finally {
        this.reconciling = false;
        if (this.desired && !stateMatches(this.confirmed, this.desired) &&
          this.blockedGeneration !== this.generation) {
          this.reconcile();
        }
      }
    })();
  }
}

