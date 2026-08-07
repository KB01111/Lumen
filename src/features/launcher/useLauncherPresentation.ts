import {useEffect, useRef, useState} from 'react';

import {motionTokens} from '../../design-system/motion';
import type {WindowService} from '../../platform/window/window-service';
import {useLauncherStore} from './launcher.store';

type PresentationMode = 'collapsed' | 'expanded';

export interface LauncherPresentationOptions {
  hasContent: boolean;
  reducedMotion: boolean;
  windowService: WindowService;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The launcher presentation could not be updated.';
}

export function useLauncherPresentation({
  hasContent,
  reducedMotion,
  windowService,
}: LauncherPresentationOptions) {
  const [expanded, setExpanded] = useState(false);
  const [presentationError, setPresentationError] = useState<string | null>(null);
  const expandedRef = useRef(false);
  const hasContentRef = useRef(hasContent);
  const desiredMode = useRef<PresentationMode>('collapsed');
  const nativeMode = useRef<PresentationMode>('collapsed');
  const reconciling = useRef(false);
  const mounted = useRef(true);
  const collapseTimer = useRef(0);
  const windowServiceRef = useRef(windowService);
  const reconcileRef = useRef<() => void>(() => undefined);

  hasContentRef.current = hasContent;
  windowServiceRef.current = windowService;

  const showExpandedWorkspace = () => {
    if (!mounted.current || !hasContentRef.current) return;
    useLauncherStore.getState().show('expanded');
    expandedRef.current = true;
    setExpanded(true);
  };

  const hideExpandedWorkspace = () => {
    if (!mounted.current) return;
    expandedRef.current = false;
    setExpanded(false);
  };

  reconcileRef.current = () => {
    if (reconciling.current || !mounted.current) return;
    reconciling.current = true;
    void (async () => {
      while (mounted.current) {
        const requestedMode = desiredMode.current;
        if (nativeMode.current === requestedMode) {
          if (requestedMode === 'expanded') showExpandedWorkspace();
          break;
        }

        try {
          await windowServiceRef.current.show(requestedMode);
        } catch (error) {
          if (!mounted.current) break;
          if (requestedMode === 'collapsed') {
            // A failed collapse leaves the prior expanded native bounds in place.
            // Restore the workspace so the window cannot become an empty hit area.
            nativeMode.current = 'expanded';
            desiredMode.current = 'expanded';
            useLauncherStore.getState().show('expanded');
            expandedRef.current = true;
            setExpanded(true);
          } else {
            nativeMode.current = 'collapsed';
            desiredMode.current = 'collapsed';
            useLauncherStore.getState().setMode('collapsed');
            hideExpandedWorkspace();
          }
          setPresentationError(errorMessage(error));
          continue;
        }

        if (!mounted.current) break;
        nativeMode.current = requestedMode;
        if (requestedMode === 'expanded' && desiredMode.current === 'expanded') {
          showExpandedWorkspace();
        }
      }

      reconciling.current = false;
      if (mounted.current && nativeMode.current !== desiredMode.current) {
        reconcileRef.current();
      }
    })();
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(collapseTimer.current);
    };
  }, []);

  useEffect(() => {
    window.clearTimeout(collapseTimer.current);

    if (hasContent) {
      setPresentationError(null);
      desiredMode.current = 'expanded';
      reconcileRef.current();
      return;
    }

    const hadVisibleWorkspace = expandedRef.current;
    hideExpandedWorkspace();
    const requestCollapse = () => {
      useLauncherStore.getState().setMode('collapsed');
      desiredMode.current = 'collapsed';
      reconcileRef.current();
    };

    if (hadVisibleWorkspace) {
      const closeDelay = reducedMotion ? 0 : motionTokens.duration.launcherClose * 1000;
      collapseTimer.current = window.setTimeout(requestCollapse, closeDelay);
    } else {
      requestCollapse();
    }

    return () => window.clearTimeout(collapseTimer.current);
  }, [hasContent, reducedMotion]);

  return {expanded, presentationError};
}
