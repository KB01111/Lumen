import {
  BatteryWarningIcon,
  ClockIcon,
  GaugeIcon,
  HourglassMediumIcon,
  PauseCircleIcon,
  PlayCircleIcon,
} from '@phosphor-icons/react';
import * as stylex from '@stylexjs/stylex';

import {CinemaIcon, GamingPauseIcon, IndexedRootIcon} from '../../design-system/icons/lumen-icons';
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

function ActivityIcon({mode}: {mode?: ActivityMode}) {
  switch (mode) {
    case 'indexing': return <IndexedRootIcon size={27} />;
    case 'slow': return <GaugeIcon aria-hidden="true" size={27} />;
    case 'gaming': return <GamingPauseIcon size={27} />;
    case 'fullscreen': return <PauseCircleIcon aria-hidden="true" size={27} />;
    case 'cinema': return <CinemaIcon size={27} />;
    case 'idle': return <HourglassMediumIcon aria-hidden="true" size={27} />;
    case 'battery': return <BatteryWarningIcon aria-hidden="true" size={27} />;
    case 'user': return <PlayCircleIcon aria-hidden="true" size={27} />;
    default: return <GaugeIcon aria-hidden="true" size={27} />;
  }
}

const manualOnlyPresentation = {
  label: 'Manual control available',
  description: 'No automatic Windows activity detector is connected.',
  recommendation: 'Use manual pause when you want to stop new index synchronization and enrichment.',
  tone: 'neutral' as const,
};

export function ActivityStatus({mode}: {mode?: ActivityMode}) {
  const presentation = mode ? activityPresentations[mode] : manualOnlyPresentation;
  return (
    <section
      aria-label={`${presentation.label}. ${presentation.description}`}
      data-testid={mode ? `activity-${mode}` : 'activity-manual'}
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
          {mode === 'indexing' ? <ClockIcon aria-hidden="true" size={14} /> : null}
        </div>
        <LumenText tone="secondary">{presentation.description}</LumenText>
        <LumenText tone="tertiary" variant="meta">{presentation.recommendation}</LumenText>
      </div>
    </section>
  );
}
