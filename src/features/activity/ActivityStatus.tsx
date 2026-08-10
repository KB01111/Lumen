import {CinemaIcon, GamingPauseIcon, IndexedRootIcon} from '../../design-system/icons/lumen-icons';
import {LumenUiIcon} from '../../design-system/icons/LumenUiIcon';
import {LumenText} from '../../design-system/primitives/LumenText';
import {activityPresentations, type ActivityMode} from './activity.types';

function ActivityIcon({mode}: {mode: ActivityMode}) {
  switch (mode) {
    case 'indexing': return <IndexedRootIcon size={27} />;
    case 'slow': return <LumenUiIcon name="speed" size="large" />;
    case 'gaming': return <GamingPauseIcon size={27} />;
    case 'fullscreen': return <LumenUiIcon name="pause" size="large" />;
    case 'cinema': return <CinemaIcon size={27} />;
    case 'idle': return <LumenUiIcon name="clock" size="large" />;
    case 'battery': return <LumenUiIcon name="error" size="large" />;
    case 'user': return <LumenUiIcon name="play" size="large" />;
  }
}

export function ActivityStatus({mode}: {mode: ActivityMode}) {
  const presentation = activityPresentations[mode];
  return (
    <section
      aria-label={`${presentation.label}. ${presentation.description}`}
      className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-5 rounded-surface border border-border-subtle bg-surface-inset p-6"
      data-testid={`activity-${mode}`}
      role="status"
    >
      <span aria-hidden="true" className={['grid size-12 place-items-center rounded-control bg-accent/10 text-accent', presentation.tone === 'warning' ? 'bg-warning/10 text-warning' : '', presentation.tone === 'neutral' ? 'bg-surface-raised text-text-secondary' : ''].filter(Boolean).join(' ')}>
        <ActivityIcon mode={mode} />
      </span>
      <div className="grid min-w-0 gap-1">
        <div className="flex items-center gap-2">
          <LumenText as="h2" variant="bodyLarge" weight="semibold">{presentation.label}</LumenText>
          {mode === 'indexing' ? <LumenUiIcon name="clock" size="small" /> : null}
        </div>
        <LumenText tone="secondary">{presentation.description}</LumenText>
        <LumenText tone="tertiary" variant="meta">{presentation.recommendation}</LumenText>
      </div>
    </section>
  );
}
