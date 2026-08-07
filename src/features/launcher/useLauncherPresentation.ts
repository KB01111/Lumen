import {useEffect, useRef, useState} from 'react';

import {motionTokens} from '../../design-system/motion';
import type {WindowService} from '../../platform/window/window-service';
import {useLauncherStore} from './launcher.store';

type PresentationMode = 'collapsed' | 'expanded';
type NativeMode = PresentationMode | 'unknown';
type NativeVisibility = 'hidden' | 'unknown' | 'visible';

interface PresentationClient {
  canRestoreCollapseFailure(): boolean;
  hasContent(): boolean;
  onCollapseFailure(error: unknown): void;
  onCollapseFallback(error: unknown): void;
  onCollapseHideFailure(error: unknown): void;
  onExpansionFailure(error: unknown): void;
  onNativeExpanded(): void;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The launcher presentation could not be updated.';
}

/**
 * Native window calls are irreversible once issued, so this coordinator lives
 * with the WindowService rather than a React hook instance. A new launcher
 * mount takes over the same queue and its desired mode always wins last.
 */
class WindowPresentationCoordinator {
  private activeClient: PresentationClient | null = null;
  private desiredMode: PresentationMode = 'collapsed';
  private generation = 0;
  private nativeMode: NativeMode = 'collapsed';
  private nativeVisibility: NativeVisibility = 'visible';
  private reconciling = false;
  private suspended = false;

  constructor(private readonly windowService: WindowService) {}

  attach(client: PresentationClient) {
    this.activeClient = client;
    this.generation += 1;
    this.suspended = false;
    this.reconcile();
  }

  detach(client: PresentationClient) {
    if (this.activeClient !== client) return;
    this.activeClient = null;
    this.desiredMode = 'collapsed';
    this.generation += 1;
    this.reconcile();
  }

  setDesiredMode(client: PresentationClient, mode: PresentationMode) {
    if (this.activeClient !== client) return;
    const modeChanged = this.desiredMode !== mode;
    this.desiredMode = mode;
    if (modeChanged) this.generation += 1;
    this.suspended = false;
    this.reconcile();
  }

  private reconcile() {
    if (this.reconciling || this.suspended) return;
    this.reconciling = true;
    void (async () => {
      try {
        while (true) {
          const requestedMode = this.desiredMode;
          const needsShow = this.nativeVisibility !== 'visible' && requestedMode === 'expanded';
          if (this.nativeMode === requestedMode && !needsShow) {
            if (requestedMode === 'expanded' && this.activeClient?.hasContent()) {
              this.activeClient.onNativeExpanded();
            }
            break;
          }

          const issuedClient = this.activeClient;
          const issuedGeneration = this.generation;
          try {
            await this.windowService.show(requestedMode);
          } catch (error) {
            if (requestedMode === 'collapsed') {
              // A failed collapse retains the previous expanded native bounds.
              this.nativeMode = 'expanded';
              this.nativeVisibility = 'visible';
              const ownsFailure = issuedClient === this.activeClient &&
                issuedGeneration === this.generation;
              if (!this.activeClient) {
                this.suspended = true;
                break;
              }
              if (!ownsFailure) {
                // A later client/intent owns recovery; make one serialized attempt.
                continue;
              }
              if (this.activeClient.canRestoreCollapseFailure()) {
                this.desiredMode = 'expanded';
                this.generation += 1;
                this.activeClient.onCollapseFailure(error);
                continue;
              }
              try {
                await this.windowService.hide();
                this.nativeVisibility = 'hidden';
                if (issuedClient === this.activeClient && issuedGeneration === this.generation) {
                  this.activeClient.onCollapseFallback(error);
                }
              } catch (hideError) {
                this.nativeMode = 'unknown';
                this.nativeVisibility = 'unknown';
                if (issuedClient === this.activeClient && issuedGeneration === this.generation) {
                  this.activeClient.onCollapseHideFailure(hideError);
                }
              }
              this.suspended = true;
              break;
            } else {
              this.nativeMode = 'collapsed';
              this.nativeVisibility = 'visible';
              this.desiredMode = 'collapsed';
              this.generation += 1;
              this.activeClient?.onExpansionFailure(error);
            }
            break;
          }

          this.nativeMode = requestedMode;
          this.nativeVisibility = 'visible';
          if (requestedMode === 'expanded' && this.desiredMode === 'expanded' &&
            this.activeClient?.hasContent()) {
            this.activeClient.onNativeExpanded();
          }
        }
      } finally {
        this.reconciling = false;
        if (!this.suspended && this.nativeMode !== this.desiredMode) this.reconcile();
      }
    })();
  }
}

const coordinators = new WeakMap<WindowService, WindowPresentationCoordinator>();

function coordinatorFor(windowService: WindowService) {
  let coordinator = coordinators.get(windowService);
  if (!coordinator) {
    coordinator = new WindowPresentationCoordinator(windowService);
    coordinators.set(windowService, coordinator);
  }
  return coordinator;
}

export interface LauncherPresentationOptions {
  hasContent: boolean;
  reducedMotion: boolean;
  windowService: WindowService;
}

export function useLauncherPresentation({
  hasContent,
  reducedMotion,
  windowService,
}: LauncherPresentationOptions) {
  const [expanded, setExpanded] = useState(false);
  const [presentationError, setPresentationError] = useState<string | null>(null);
  const attached = useRef(false);
  const expandedRef = useRef(false);
  const canRestoreCollapseFailure = useRef(false);
  const hasContentRef = useRef(hasContent);
  const collapseTimer = useRef(0);
  const clientRef = useRef<PresentationClient | null>(null);
  const coordinator = coordinatorFor(windowService);

  hasContentRef.current = hasContent;

  const hideExpandedWorkspace = () => {
    if (!attached.current) return;
    expandedRef.current = false;
    setExpanded(false);
  };

  if (!clientRef.current) {
    clientRef.current = {
      canRestoreCollapseFailure: () => canRestoreCollapseFailure.current,
      hasContent: () => hasContentRef.current,
      onCollapseFailure: (error) => {
        if (!attached.current) return;
        useLauncherStore.getState().show('expanded');
        expandedRef.current = true;
        setExpanded(true);
        setPresentationError(errorMessage(error));
      },
      onExpansionFailure: (error) => {
        if (!attached.current) return;
        useLauncherStore.getState().setMode('collapsed');
        hideExpandedWorkspace();
        setPresentationError(errorMessage(error));
      },
      onCollapseFallback: (error) => {
        if (!attached.current) return;
        useLauncherStore.getState().hide();
        setPresentationError(errorMessage(error));
      },
      onCollapseHideFailure: (error) => {
        if (!attached.current) return;
        useLauncherStore.getState().show('expanded');
        expandedRef.current = true;
        setExpanded(true);
        setPresentationError(errorMessage(error));
      },
      onNativeExpanded: () => {
        if (!attached.current || !hasContentRef.current) return;
        useLauncherStore.getState().show('expanded');
        expandedRef.current = true;
        setExpanded(true);
      },
    };
  }

  useEffect(() => {
    const client = clientRef.current as PresentationClient;
    attached.current = true;
    coordinator.attach(client);
    return () => {
      attached.current = false;
      window.clearTimeout(collapseTimer.current);
      coordinator.detach(client);
    };
  }, [coordinator]);

  useEffect(() => {
    const client = clientRef.current as PresentationClient;
    window.clearTimeout(collapseTimer.current);

    if (hasContent) {
      setPresentationError(null);
      coordinator.setDesiredMode(client, 'expanded');
      return;
    }

    const hadVisibleWorkspace = expandedRef.current;
    hideExpandedWorkspace();
    const requestCollapse = () => {
      canRestoreCollapseFailure.current = hadVisibleWorkspace;
      useLauncherStore.getState().setMode('collapsed');
      coordinator.setDesiredMode(client, 'collapsed');
    };

    if (hadVisibleWorkspace) {
      const closeDelay = reducedMotion ? 0 : motionTokens.duration.launcherClose * 1000;
      collapseTimer.current = window.setTimeout(requestCollapse, closeDelay);
    } else {
      requestCollapse();
    }

    return () => window.clearTimeout(collapseTimer.current);
  }, [coordinator, hasContent, reducedMotion]);

  return {expanded, presentationError};
}
