import * as stylex from '@stylexjs/stylex';

import {tokens} from './tokens.stylex';

const noiseTexture =
  'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 180 180\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'.92\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'.72\'/%3E%3C/svg%3E")';

export const materialStyles = stylex.create({
  surface: {
    position: 'relative',
    isolation: 'isolate',
    overflow: 'hidden',
    color: tokens.colorTextPrimary,
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    boxShadow: `${tokens.shadowInsetTop}, ${tokens.shadowInsetBottom}`,
  },
  mica: {
    backgroundColor: tokens.colorMaterialBackdrop,
    backdropFilter: `blur(${tokens.blurGlass}) saturate(135%)`,
    boxShadow: `${tokens.shadowInsetTop}, ${tokens.shadowInsetBottom}, ${tokens.shadowAmbient}`,
  },
  raised: {
    backgroundColor: tokens.colorMaterialRaised,
    backdropFilter: `blur(${tokens.blurRaised}) saturate(125%)`,
    boxShadow: `${tokens.shadowInsetTop}, ${tokens.shadowInsetBottom}, ${tokens.shadowControl}`,
  },
  inset: {
    backgroundColor: tokens.colorMaterialInset,
    boxShadow: `${tokens.shadowInsetBottom}, inset 0 2px 8px rgba(0, 0, 0, 0.16)`,
  },
  flat: {
    backgroundColor: tokens.colorMaterialTint,
    boxShadow: 'none',
  },
  tint: {
    position: 'absolute',
    inset: 0,
    zIndex: -3,
    pointerEvents: 'none',
    backgroundColor: tokens.colorMaterialTint,
  },
  luminosity: {
    position: 'absolute',
    inset: 0,
    zIndex: -2,
    pointerEvents: 'none',
    opacity: tokens.luminosityOpacity,
    backgroundImage:
      'radial-gradient(120% 90% at 14% -18%, rgba(255, 255, 255, 0.19), transparent 54%)',
    backgroundColor: tokens.colorLuminosity,
    mixBlendMode: 'screen',
  },
  noise: {
    position: 'absolute',
    inset: 0,
    zIndex: -1,
    pointerEvents: 'none',
    opacity: tokens.noiseOpacity,
    backgroundImage: noiseTexture,
    backgroundRepeat: 'repeat',
    backgroundSize: '180px 180px',
    mixBlendMode: 'soft-light',
  },
  content: {
    position: 'relative',
    zIndex: 0,
    width: '100%',
    height: '100%',
  },
});
