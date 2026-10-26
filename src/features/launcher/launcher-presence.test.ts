import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {BrowserWindowService} from '../../platform/window/browser-window-service';
import {attachLauncherPresence, dismissLauncher} from './launcher-presence';
import {useLauncherStore} from './launcher.store';
import {requestWindowHide} from './useLauncherPresentation';

class FakeAnimation extends EventTarget {
  playState: AnimationPlayState = 'running';
  readonly finished: Promise<FakeAnimation>;
  private resolveFinished!: (animation: FakeAnimation) => void;
  private rejectFinished!: (reason: unknown) => void;

  constructor(
    private readonly element: HTMLElement,
    readonly keyframes: Keyframe[],
    readonly options: KeyframeAnimationOptions,
  ) {
    super();
    this.finished = new Promise((resolve, reject) => {
      this.resolveFinished = resolve;
      this.rejectFinished = reject;
    });
    // Browsers mark a cancelled animation's finished promise as handled.
    this.finished.catch(() => undefined);
  }

  finish() {
    this.playState = 'finished';
    if (this.options.fill === 'forwards') {
      this.element.style.opacity = String(this.keyframes[this.keyframes.length - 1]?.opacity);
    }
    this.resolveFinished(this);
    this.dispatchEvent(new Event('finish'));
  }

  cancel() {
    this.playState = 'idle';
    this.element.style.opacity = '';
    this.rejectFinished(new DOMException('Cancelled', 'AbortError'));
    this.dispatchEvent(new Event('cancel'));
  }
}

function presenceSurface() {
  const element = document.body.appendChild(document.createElement('div'));
  const animations: FakeAnimation[] = [];
  element.animate = vi.fn((keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
    const animation = new FakeAnimation(element, keyframes, options);
    animations.push(animation);
    return animation as unknown as Animation;
  }) as unknown as HTMLElement['animate'];
  return {animations, element};
}

let detach: (() => void) | null = null;

beforeEach(() => {
  useLauncherStore.getState().reset();
});

afterEach(() => {
  detach?.();
  detach = null;
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('launcher presence', () => {
  it('appears immediately when no dismissal is holding the surface', () => {
    const {animations, element} = presenceSurface();
    detach = attachLauncherPresence(element, false);

    useLauncherStore.getState().hide();
    useLauncherStore.getState().show('collapsed');

    expect(animations).toHaveLength(0);
  });

  it('holds a transparent dismissal frame, then summons from the origin to rest', async () => {
    const {animations, element} = presenceSurface();
    detach = attachLauncherPresence(element, false);
    useLauncherStore.getState().hide();

    const dismissal = dismissLauncher();
    expect(animations).toHaveLength(1);
    const [dismiss] = animations;
    expect(dismiss.options).toMatchObject({duration: 110, easing: 'linear', fill: 'forwards'});
    expect(dismiss.keyframes.slice(1)).toEqual([
      {opacity: 0, transform: 'scale(0.985)', offset: 0.75},
      {opacity: 0, transform: 'scale(0.985)'},
    ]);
    dismiss.finish();
    await dismissal;
    expect(element.style.opacity).toBe('0');

    useLauncherStore.getState().show('collapsed');

    expect(animations).toHaveLength(2);
    const summon = animations[1];
    expect(summon.keyframes).toEqual([
      {opacity: 0, transform: 'translateY(-4px) scale(0.97)'},
      {opacity: 1, transform: 'none'},
    ]);
    expect(summon.options).toMatchObject({duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)'});
    expect(summon.options.fill).toBeUndefined();
    expect(dismiss.playState).toBe('idle');

    summon.finish();
    useLauncherStore.getState().hide();
    useLauncherStore.getState().show('collapsed');
    expect(animations).toHaveLength(2);
  });

  it('turns an interrupted dismissal around and cancels the pending native hide', async () => {
    const {animations, element} = presenceSurface();
    detach = attachLauncherPresence(element, false);
    const windowService = new BrowserWindowService();
    await windowService.show('collapsed');
    const nativeHide = vi.spyOn(windowService, 'hide');

    const hidden = requestWindowHide(windowService);
    expect(useLauncherStore.getState().visible).toBe(false);
    element.style.opacity = '0.4';
    useLauncherStore.getState().show('collapsed');

    await expect(hidden).resolves.toBe(false);
    expect(nativeHide).not.toHaveBeenCalled();
    expect(animations[0].playState).toBe('idle');
    expect(animations[1].keyframes[0]).toMatchObject({opacity: 0.4});
  });

  it('requests the native hide only after the dismissal completes', async () => {
    const {animations, element} = presenceSurface();
    detach = attachLauncherPresence(element, false);
    const windowService = new BrowserWindowService();
    await windowService.show('collapsed');
    const nativeHide = vi.spyOn(windowService, 'hide');

    const hidden = requestWindowHide(windowService);
    await Promise.resolve();
    expect(nativeHide).not.toHaveBeenCalled();

    animations[0].finish();
    await expect(hidden).resolves.toBe(true);
    expect(nativeHide).toHaveBeenCalledTimes(1);
    expect(windowService.snapshot().visible).toBe(false);
  });

  it('joins a repeated hide to the dismissal in flight', async () => {
    const {animations, element} = presenceSurface();
    detach = attachLauncherPresence(element, false);
    const windowService = new BrowserWindowService();
    await windowService.show('collapsed');
    const nativeHide = vi.spyOn(windowService, 'hide');

    const first = requestWindowHide(windowService);
    const second = requestWindowHide(windowService);
    await Promise.resolve();

    expect(animations).toHaveLength(1);
    expect(animations[0].playState).toBe('running');
    expect(nativeHide).not.toHaveBeenCalled();
    animations[0].finish();
    await Promise.all([first, second]);
    expect(nativeHide).toHaveBeenCalled();
    expect(windowService.snapshot().visible).toBe(false);
  });

  it('never animates expanded modes over their native backdrop', () => {
    const {animations, element} = presenceSurface();
    detach = attachLauncherPresence(element, false);
    useLauncherStore.getState().show('expanded');
    useLauncherStore.getState().hide();

    expect(dismissLauncher()).toBeNull();
    expect(animations).toHaveLength(0);
  });

  it('releases a held frame instead of summoning into an expanded window', async () => {
    const {animations, element} = presenceSurface();
    detach = attachLauncherPresence(element, false);
    useLauncherStore.getState().hide();
    const dismissal = dismissLauncher();
    animations[0].finish();
    await dismissal;

    useLauncherStore.getState().show('expanded');

    expect(animations).toHaveLength(1);
    expect(animations[0].playState).toBe('idle');
    expect(element.style.opacity).toBe('');
  });

  it('keeps reduced motion to short opacity-only transitions', async () => {
    const {animations, element} = presenceSurface();
    detach = attachLauncherPresence(element, true);
    useLauncherStore.getState().hide();

    const dismissal = dismissLauncher();
    animations[0].finish();
    await dismissal;
    useLauncherStore.getState().show('collapsed');

    expect(animations[0].options.duration).toBe(80);
    expect(animations[0].keyframes[2]).toEqual({opacity: 0, transform: 'none'});
    expect(animations[1].options.duration).toBe(80);
    expect(animations[1].keyframes).toEqual([
      {opacity: 0, transform: 'none'},
      {opacity: 1, transform: 'none'},
    ]);
  });

  it('bounds the wait when the dismissal never settles', async () => {
    vi.useFakeTimers();
    const {animations, element} = presenceSurface();
    detach = attachLauncherPresence(element, false);
    useLauncherStore.getState().hide();
    const settled = vi.fn();

    void dismissLauncher()?.then(settled);
    await vi.advanceTimersByTimeAsync(229);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(settled).toHaveBeenCalledTimes(1);
    expect(animations[0].playState).toBe('running');
  });

  it('skips the dismissal without a surface or when the document is hidden', () => {
    expect(dismissLauncher()).toBeNull();

    const {animations, element} = presenceSurface();
    detach = attachLauncherPresence(element, false);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

    expect(dismissLauncher()).toBeNull();
    expect(animations).toHaveLength(0);
  });

  it('releases a held frame when the surface detaches', async () => {
    const {animations, element} = presenceSurface();
    const release = attachLauncherPresence(element, false);
    useLauncherStore.getState().hide();
    const dismissal = dismissLauncher();
    animations[0].finish();
    await dismissal;

    release();

    expect(animations[0].playState).toBe('idle');
    useLauncherStore.getState().show('collapsed');
    expect(animations).toHaveLength(1);
  });
});
