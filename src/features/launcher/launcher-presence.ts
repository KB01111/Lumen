import {motionTokens} from '../../design-system/motion';
import {useLauncherStore} from './launcher.store';

/**
 * Owns the collapsed launcher's summon and dismiss choreography.
 *
 * A hidden native window keeps the last frame it presented, so a dismissal
 * paints and holds a transparent end frame before the window hides. The next
 * native show therefore starts invisible, and the summon animates from that
 * held frame without a stale-frame flash. A show with nothing held (first
 * launch, native close) appears immediately, exactly as before. Expanded
 * modes sit on an opaque native backdrop that web opacity cannot fade, so
 * they never animate here. WAAPI drives one surface element; React state is
 * never updated per frame.
 */

interface PresenceSurface {
  element: HTMLElement;
  reducedMotion: boolean;
}

interface PresenceFrame {
  opacity: number;
  transform: string;
}

let surface: PresenceSurface | null = null;
let animation: Animation | null = null;
let dismissal: {animation: Animation; settled: Promise<void>} | null = null;

const restFrame: PresenceFrame = {opacity: 1, transform: 'none'};

function cubicBezier(points: readonly number[]) {
  return `cubic-bezier(${points.join(', ')})`;
}

function canAnimate(element: HTMLElement) {
  return typeof element.animate === 'function' &&
    useLauncherStore.getState().mode === 'collapsed';
}

function readFrame(element: HTMLElement): PresenceFrame {
  const style = getComputedStyle(element);
  const opacity = Number.parseFloat(style.opacity);
  return {
    opacity: Number.isFinite(opacity) ? opacity : 1,
    transform: style.transform || 'none',
  };
}

function track(next: Animation) {
  const previous = animation;
  animation = next;
  // Cancel only after the replacement exists so no frame renders between them.
  previous?.cancel();
  const release = () => {
    if (animation === next) animation = null;
  };
  next.addEventListener('cancel', release);
  return release;
}

function releaseHeldFrame() {
  const held = animation;
  animation = null;
  held?.cancel();
}

/** Plays the summon when a dismissal (or one in flight) is holding the surface. */
export function summonLauncher() {
  const element = surface?.element;
  if (!element || !animation) return;
  // No visibility gate: a native show can precede the WebView's visibility
  // change, and a paused timeline simply holds the invisible start frame.
  if (!canAnimate(element)) {
    releaseHeldFrame();
    return;
  }
  const {launcher, duration, easing, reduced} = motionTokens;
  const reducedMotion = surface?.reducedMotion ?? false;
  const current = readFrame(element);
  // A fully dismissed surface restarts from the summon origin; an interrupted
  // dismissal turns around from wherever it is.
  const from: PresenceFrame = current.opacity > 0.01 ? current : {
    opacity: 0,
    transform: reducedMotion
      ? 'none'
      : `translateY(${-launcher.summonOffset}px) scale(${launcher.summonScale})`,
  };
  const next = element.animate([{...from}, {...restFrame}], {
    duration: (reducedMotion ? reduced.opacityDuration : duration.launcherSummon) * 1000,
    easing: cubicBezier(reducedMotion ? easing.standard : easing.summon),
  });
  const release = track(next);
  next.addEventListener('finish', release);
}

/**
 * Fades the collapsed surface out and resolves once its transparent end frame
 * is held, so the native hide that follows cannot capture a visible frame.
 * Returns null when nothing can animate, so that hide stays synchronous; a
 * guard timer bounds the wait.
 */
export function dismissLauncher(): Promise<void> | null {
  const element = surface?.element;
  // A hidden document cannot present the fade; hide immediately as before.
  if (!element || !canAnimate(element) || document.visibilityState === 'hidden') {
    return null;
  }
  // A repeated hide joins the dismissal in flight instead of restarting it,
  // so the earlier request cannot hide the window mid-fade.
  if (dismissal && dismissal.animation === animation) return dismissal.settled;
  const {launcher, duration, easing, reduced} = motionTokens;
  const reducedMotion = surface?.reducedMotion ?? false;
  const dismissed: PresenceFrame = {
    opacity: 0,
    transform: reducedMotion ? 'none' : `scale(${launcher.dismissScale})`,
  };
  const durationMs = (reducedMotion ? reduced.opacityDuration : duration.launcherDismiss) * 1000;
  const next = element.animate([
    {...readFrame(element), easing: cubicBezier(easing.standard)},
    {...dismissed, offset: launcher.dismissFadeEnd},
    {...dismissed},
  ], {duration: durationMs, easing: 'linear', fill: 'forwards'});
  track(next);
  const settled = new Promise<void>((resolve) => {
    // A stalled timeline jumps to its held transparent frame before the hide.
    const guard = window.setTimeout(() => {
      next.finish();
      resolve();
    }, durationMs + 120);
    next.finished.then(
      () => {
        window.clearTimeout(guard);
        resolve();
      },
      // Cancelled by a newer summon or detach; the caller re-checks visibility.
      () => {
        window.clearTimeout(guard);
        resolve();
      },
    );
  });
  dismissal = {animation: next, settled};
  return settled;
}

/** Binds the choreography to the launcher surface for as long as it is mounted. */
export function attachLauncherPresence(element: HTMLElement, reducedMotion: boolean) {
  releaseHeldFrame();
  const attached: PresenceSurface = {element, reducedMotion};
  surface = attached;
  const unsubscribeVisibility = useLauncherStore.subscribe(
    (state) => state.visible,
    (visible) => {
      if (visible) summonLauncher();
    },
  );
  // Leaving the collapsed pill settles any presence motion at rest at once.
  const unsubscribeMode = useLauncherStore.subscribe(
    (state) => state.mode,
    (mode) => {
      if (mode !== 'collapsed') releaseHeldFrame();
    },
  );
  return () => {
    unsubscribeVisibility();
    unsubscribeMode();
    if (surface !== attached) return;
    releaseHeldFrame();
    surface = null;
  };
}

/** Applies a motion-policy change without releasing a held dismissal frame. */
export function setLauncherPresenceReducedMotion(reducedMotion: boolean) {
  if (surface) surface.reducedMotion = reducedMotion;
}
