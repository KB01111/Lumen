import {cn} from '../../lib/cn';
import {LumenMark} from './LumenMark';

const tileSizes = {
  small: 'size-[26px] rounded-[8px]',
  medium: 'size-[32px] rounded-[10px]',
  large: 'size-[56px] rounded-[18px]',
} as const;

const markSizes = {small: 16, medium: 21, large: 34} as const;

export interface LumenAppMarkProps {
  className?: string;
  size?: keyof typeof tileSizes;
}

/** The app-icon tile: Lumen's beam mark on its midnight glass, matching the Windows icon. */
export function LumenAppMark({className, size = 'medium'}: LumenAppMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative isolate grid shrink-0 place-items-center overflow-hidden border border-[#dcf1ff]/20 bg-[linear-gradient(145deg,#1b3142,#071017)] text-[#8fd3ff] shadow-[inset_0_1px_0_rgba(220,241,255,0.16),0_4px_14px_-4px_rgba(5,40,70,0.55)] high-contrast:border-[CanvasText] high-contrast:bg-none high-contrast:text-[CanvasText] high-contrast:shadow-none',
        tileSizes[size],
        className,
      )}
      data-lumen-app-mark={size}
    >
      <span className="absolute inset-x-0 top-0 -z-10 h-1/2 bg-[radial-gradient(70%_100%_at_50%_0%,rgba(143,211,255,0.28),transparent)] high-contrast:hidden" />
      <LumenMark className="drop-shadow-[0_0_6px_rgba(86,185,248,0.55)] high-contrast:drop-shadow-none" size={markSizes[size]} strokeWidth={size === 'large' ? 1.9 : 1.8} />
    </span>
  );
}
