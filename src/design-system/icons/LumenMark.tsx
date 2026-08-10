import {LumenIcon, type LumenIconProps} from './LumenIcon';
import {cn} from '../../lib/cn';

export type LumenMarkProps = Omit<LumenIconProps, 'children'>;

export function LumenMark({className, ...props}: LumenMarkProps) {
  return (
    <LumenIcon {...props} className={cn(className)}>
      <path d="M17.45 15.8 21 19.35" vectorEffect="non-scaling-stroke" />
      <path
        d="M17.75 10.2a7.1 7.1 0 1 1-2.08-5.02"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="m13.7 3.2-4.45 8.25h3.38l-2.08 7.35 5.02-9.2h-3.45Z"
        fill="currentColor"
        stroke="none"
        vectorEffect="non-scaling-stroke"
      />
    </LumenIcon>
  );
}
