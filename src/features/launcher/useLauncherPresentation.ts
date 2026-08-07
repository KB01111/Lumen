import {useEffect, useRef, useState} from 'react';

import {motionTokens} from '../../design-system/motion';
import type {WindowService} from '../../platform/window/window-service';
import {useLauncherStore} from './launcher.store';

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
  const showLauncher = useLauncherStore((state) => state.show);
  const setLauncherMode = useLauncherStore((state) => state.setMode);
  const [expanded, setExpanded] = useState(false);
  const [presentationError, setPresentationError] = useState<string | null>(null);
  const expandedRef = useRef(false);
  const transitionSequence = useRef(0);
  const collapseTimer = useRef(0);

  useEffect(() => {
    const transition = ++transitionSequence.current;
    window.clearTimeout(collapseTimer.current);

    if (hasContent) {
      setPresentationError(null);
      void (async () => {
        try {
          await windowService.show('expanded');
          if (transition !== transitionSequence.current) return;
          showLauncher('expanded');
          expandedRef.current = true;
          setExpanded(true);
        } catch (error) {
          if (transition !== transitionSequence.current) return;
          expandedRef.current = false;
          setExpanded(false);
          setLauncherMode('collapsed');
          setPresentationError(errorMessage(error));
        }
      })();
      return;
    }

    if (!expandedRef.current) return;

    expandedRef.current = false;
    setExpanded(false);
    const closeDelay = reducedMotion ? 0 : motionTokens.duration.launcherClose * 1000;
    collapseTimer.current = window.setTimeout(() => {
      if (transition !== transitionSequence.current) return;
      setLauncherMode('collapsed');
      void windowService.show('collapsed').catch((error: unknown) => {
        if (transition === transitionSequence.current) {
          setPresentationError(errorMessage(error));
        }
      });
    }, closeDelay);

    return () => window.clearTimeout(collapseTimer.current);
  }, [hasContent, reducedMotion, setLauncherMode, showLauncher, windowService]);

  useEffect(() => () => window.clearTimeout(collapseTimer.current), []);

  return {expanded, presentationError};
}
