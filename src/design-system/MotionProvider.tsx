import {createContext, useContext, useMemo, type PropsWithChildren} from 'react';

import {MotionConfig} from 'motion/react';

import {motionTokens} from './motion';

export interface LumenMotionContextValue {
  reducedMotion: boolean;
  opacityDuration: number;
  pageDuration: number;
  layoutTransition: typeof motionTokens.selectionSpring | {duration: number};
}

const defaultMotion: LumenMotionContextValue = {
  reducedMotion: false,
  opacityDuration: motionTokens.duration.preview,
  pageDuration: motionTokens.duration.page,
  layoutTransition: motionTokens.selectionSpring,
};

const LumenMotionContext = createContext<LumenMotionContextValue>(defaultMotion);

export function LumenMotionProvider({
  children,
  reducedMotion,
}: PropsWithChildren<{reducedMotion: boolean}>) {
  const value = useMemo<LumenMotionContextValue>(
    () => ({
      reducedMotion,
      opacityDuration: reducedMotion
        ? motionTokens.reduced.opacityDuration
        : motionTokens.duration.preview,
      pageDuration: reducedMotion
        ? motionTokens.reduced.opacityDuration
        : motionTokens.duration.page,
      layoutTransition: reducedMotion
        ? {duration: motionTokens.reduced.layoutDuration}
        : motionTokens.selectionSpring,
    }),
    [reducedMotion],
  );

  return (
    <LumenMotionContext.Provider value={value}>
      <MotionConfig reducedMotion={reducedMotion ? 'always' : 'never'}>
        {children}
      </MotionConfig>
    </LumenMotionContext.Provider>
  );
}

export function useLumenMotion() {
  return useContext(LumenMotionContext);
}
