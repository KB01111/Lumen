import {useState} from 'react';

import * as stylex from '@stylexjs/stylex';

import {LumenUiIcon} from '../../../design-system/icons/LumenUiIcon';
import {LumenButton} from '../../../design-system/primitives/LumenButton';
import {LumenIconButton} from '../../../design-system/primitives/LumenIconButton';
import {LumenText} from '../../../design-system/primitives/LumenText';
import {tokens} from '../../../design-system/tokens.stylex';
import {ActivityStatus} from '../../activity/ActivityStatus';
import {ApplicationOverrideRow} from '../../activity/ApplicationOverrideRow';
import {useActivityStore} from '../../activity/activity.store';
import type {ActivityMode} from '../../activity/activity.types';
import {SettingRow} from '../components/SettingRow';
import {SettingSection} from '../components/SettingSection';
import {LumenSelect, LumenSwitch, LumenTextField} from '../components/SettingsControls';
import {SettingsCallout, SettingsPage} from '../components/SettingsPage';
import {useSettingsStore} from '../settings.store';

const styles = stylex.create({
  stateToolbar: {display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: tokens.space6},
  addRow: {display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: tokens.space4, padding: tokens.space8},
  chips: {display: 'flex', flexWrap: 'wrap', gap: tokens.space3, padding: tokens.space8},
  chip: {
    display: 'inline-flex',
    minHeight: tokens.controlHeightMedium,
    alignItems: 'center',
    gap: tokens.space3,
    paddingInlineStart: tokens.space6,
    color: tokens.colorTextSecondary,
    backgroundColor: tokens.colorMaterialRaised,
    borderRadius: tokens.radiusRound,
    fontFamily: tokens.fontFamilyText,
    fontSize: tokens.fontSizeMeta,
  },
});

function applicationId(application: string) {
  return `app-${application.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

export function ActivityPage() {
  const activity = useSettingsStore((state) => state.activity);
  const updateActivity = useSettingsStore((state) => state.updateActivity);
  const mode = useActivityStore((state) => state.mode);
  const message = useActivityStore((state) => state.message);
  const setMode = useActivityStore((state) => state.setMode);
  const toggleUserPause = useActivityStore((state) => state.toggleUserPause);
  const resetClassifications = useActivityStore((state) => state.resetClassifications);
  const [overrideName, setOverrideName] = useState('');
  const [gameName, setGameName] = useState('');

  const addOverride = () => {
    const application = overrideName.trim();
    if (!application || activity.overrides.some((item) => item.application.toLowerCase() === application.toLowerCase())) return;
    void updateActivity({
      overrides: [...activity.overrides, {id: applicationId(application), application, policy: 'automatic'}],
    });
    setOverrideName('');
  };

  const addGame = () => {
    const game = gameName.trim();
    if (!game || activity.userGames.includes(game)) return;
    void updateActivity({userGames: [...activity.userGames, game]});
    setGameName('');
  };

  const resetAll = () => {
    void updateActivity({overrides: [], userGames: []});
    resetClassifications();
  };

  return (
    <SettingsPage>
      <div {...stylex.props(styles.stateToolbar)}>
        <LumenSelect<ActivityMode>
          aria-label="Development activity state"
          options={[
            {id: 'indexing', label: 'Indexing'},
            {id: 'slow', label: 'Indexing slowly'},
            {id: 'gaming', label: 'Paused for gaming'},
            {id: 'fullscreen', label: 'Paused for fullscreen'},
            {id: 'cinema', label: 'Cinema mode'},
            {id: 'idle', label: 'Waiting for idle'},
            {id: 'battery', label: 'Paused on battery'},
            {id: 'user', label: 'Paused by user'},
          ]}
          value={mode}
          onChange={(next) => setMode(next)}
        />
        <LumenButton size="small" variant={mode === 'user' ? 'primary' : 'subtle'} onPress={toggleUserPause}>
          {mode === 'user' ? 'Resume indexing' : 'Pause indexing'}
        </LumenButton>
      </div>
      <ActivityStatus mode={mode} />
      {message ? <SettingsCallout>{message}</SettingsCallout> : null}
      <SettingSection title="Automatic quiet modes" description="Classification changes background work only; the launcher remains available.">
        <SettingRow label="Detect games automatically" description="Pause background indexing for recognized games.">
          <LumenSwitch aria-label="Detect games automatically" isSelected={activity.detectGames} onChange={(detectGames) => void updateActivity({detectGames})} />
        </SettingRow>
        <SettingRow label="Detect fullscreen applications" description="Stay quiet when a foreground app occupies the display.">
          <LumenSwitch aria-label="Detect fullscreen applications" isSelected={activity.detectFullscreen} onChange={(detectFullscreen) => void updateActivity({detectFullscreen})} />
        </SettingRow>
        <SettingRow label="Allow indexing during video" description="Permit normal indexing instead of Cinema behavior.">
          <LumenSwitch aria-label="Allow indexing during video" isSelected={activity.allowDuringVideo} onChange={(allowDuringVideo) => void updateActivity({allowDuringVideo})} />
        </SettingRow>
        <SettingRow label="Metadata-only Cinema mode" description="During playback, allow only lightweight filename and metadata work.">
          <LumenSwitch aria-label="Metadata-only Cinema mode" isSelected={activity.cinemaMetadataOnly} onChange={(cinemaMetadataOnly) => void updateActivity({cinemaMetadataOnly})} />
        </SettingRow>
        <SettingRow label="Pause on battery" description="Protect battery life when the device is unplugged.">
          <LumenSwitch aria-label="Pause on battery" isSelected={activity.pauseOnBattery} onChange={(pauseOnBattery) => void updateActivity({pauseOnBattery})} />
        </SettingRow>
        <SettingRow label="Resume delay" description="Wait after a game or fullscreen app closes before background work resumes.">
          <LumenSelect
            aria-label="Resume delay"
            options={[{id: '0', label: 'Immediately'}, {id: '15', label: '15 seconds'}, {id: '30', label: '30 seconds'}, {id: '60', label: '1 minute'}]}
            value={String(activity.resumeDelaySeconds) as '0' | '15' | '30' | '60'}
            onChange={(value) => void updateActivity({resumeDelaySeconds: Number(value)})}
          />
        </SettingRow>
      </SettingSection>
      <SettingSection title="Application overrides" description="Give a specific executable a stable policy instead of relying on classification.">
        <div {...stylex.props(styles.addRow)}>
          <LumenTextField
            aria-label="Application override"
            placeholder="Example: render.exe"
            value={overrideName}
            onChange={setOverrideName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addOverride();
              }
            }}
          />
          <LumenButton aria-label="Add application override" size="small" onPress={addOverride}><LumenUiIcon name="add" size="small" /> Add</LumenButton>
        </div>
        {activity.overrides.map((override) => (
          <ApplicationOverrideRow
            key={override.id}
            override={override}
            onChange={(next) => void updateActivity({overrides: activity.overrides.map((item) => item.id === next.id ? next : item)})}
            onRemove={() => void updateActivity({overrides: activity.overrides.filter((item) => item.id !== override.id)})}
          />
        ))}
      </SettingSection>
      <SettingSection title="User-defined games" description="Add executables that Windows or a future detector may not classify.">
        <div {...stylex.props(styles.addRow)}>
          <LumenTextField aria-label="User-defined game" placeholder="Example: game.exe" value={gameName} onChange={setGameName} />
          <LumenButton aria-label="Add user-defined game" size="small" onPress={addGame}><LumenUiIcon name="tools" size="small" /> Add game</LumenButton>
        </div>
        {activity.userGames.length ? (
          <div {...stylex.props(styles.chips)}>
            {activity.userGames.map((game) => (
              <span key={game} {...stylex.props(styles.chip)}>
                {game}
                <LumenIconButton aria-label={`Remove game ${game}`} size="small" variant="quiet" onPress={() => void updateActivity({userGames: activity.userGames.filter((item) => item !== game)})}>
                  <LumenUiIcon name="close" size="small" />
                </LumenIconButton>
              </span>
            ))}
          </div>
        ) : <div {...stylex.props(styles.chips)}><LumenText tone="tertiary" variant="meta">No custom game classifications.</LumenText></div>}
      </SettingSection>
      <LumenButton aria-label="Reset classifications" size="small" variant="quiet" onPress={resetAll}>Reset classifications</LumenButton>
    </SettingsPage>
  );
}
