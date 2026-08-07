import * as stylex from '@stylexjs/stylex';

import {CinemaIcon, GamingPauseIcon, IndexedRootIcon} from '../../design-system/icons/lumen-icons';
import {LumenUiIcon} from '../../design-system/icons/LumenUiIcon';
import {LumenText} from '../../design-system/primitives/LumenText';
import {tokens} from '../../design-system/tokens.stylex';
import {activityPresentations, type ActivityMode} from './activity.types';

const styles = stylex.create({
  status: {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    alignItems: 'center',
    gap: tokens.space8,
    padding: tokens.space10,
    backgroundColor: tokens.colorMaterialInset,
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusLarge,
    boxShadow: tokens.shadowInsetTop,
  },
  icon: {
    width: '50px',
    height: '50px',
    display: 'grid',
    placeItems: 'center',
    color: tokens.colorAccent,
    backgroundColor: tokens.colorAccentMuted,
    borderRadius: tokens.radiusLarge,
  },
  warning: {color: tokens.colorWarning, backgroundColor: tokens.colorWarningMuted},
  neutral: {color: tokens.colorTextSecondary, backgroundColor: tokens.colorMaterialRaised},
  text: {display: 'grid', gap: tokens.space2},
  title: {display: 'flex', alignItems: 'center', gap: tokens.space4},
});

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
      data-testid={`activity-${mode}`}
      {...stylex.props(styles.status)}
    >
      <span aria-hidden="true" {...stylex.props(
        styles.icon,
        presentation.tone === 'warning' && styles.warning,
        presentation.tone === 'neutral' && styles.neutral,
      )}>
        <ActivityIcon mode={mode} />
      </span>
      <div {...stylex.props(styles.text)}>
        <div {...stylex.props(styles.title)}>
          <LumenText as="h2" variant="bodyLarge" weight="semibold">{presentation.label}</LumenText>
          {mode === 'indexing' ? <LumenUiIcon name="clock" size="small" /> : null}
        </div>
        <LumenText tone="secondary">{presentation.description}</LumenText>
        <LumenText tone="tertiary" variant="meta">{presentation.recommendation}</LumenText>
      </div>
    </section>
  );
}
