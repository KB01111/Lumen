export const motionTokens = {
  duration: {
    hover: 0.09,
    press: 0.072,
    selection: 0.12,
    launcherOpen: 0.16,
    launcherClose: 0.12,
    launcherExpansion: 0.19,
    preview: 0.16,
    page: 0.21,
  },
  easing: {
    standard: [0.2, 0.8, 0.2, 1] as const,
    exit: [0.4, 0, 1, 1] as const,
  },
  selectionSpring: {
    type: 'spring' as const,
    stiffness: 520,
    damping: 44,
    mass: 0.72,
  },
  reduced: {
    layoutDuration: 0,
    opacityDuration: 0.08,
  },
} as const;
