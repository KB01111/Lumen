import {useState} from 'react';

import {GameControllerIcon, PlusIcon, XIcon} from '@phosphor-icons/react';
import * as stylex from '@stylexjs/stylex';

import {LumenButton} from '../../../design-system/primitives/LumenButton';
import {LumenIconButton} from '../../../design-system/primitives/LumenIconButton';
import {LumenText} from '../../../design-system/primitives/LumenText';
import {tokens} from '../../../design-system/tokens.stylex';
import {isNativeRuntime, nativeAiService} from '../../../services/ai/native-ai-service';
import {ActivityStatus} from '../../activity/ActivityStatus';
import {ApplicationOverrideRow} from '../../activity/ApplicationOverrideRow';
import {useActivityStore} from '../../activity/activity.store';
import type {ActivityMode} from '../../activity/activity.types';
import {SettingRow} from '../components/SettingRow';
import {SettingSection} from '../components/SettingSection';
import {LumenSelect, LumenSwitch, LumenTextField} from '../components/SettingsControls';
import {SettingsCallout, SettingsPage} from '../components/SettingsPage';
import {StatusBadge} from '../components/StatusBadge';
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

type ActivityRuntimeService = Pick<typeof nativeAiService, 'pauseEnrichment' | 'resumeEnrichment'>;

export function ActivityPage({
  runtimeService = nativeAiService,
}: {
  runtimeService?: ActivityRuntimeService;
}) {
  const activity = useSettingsStore((state) => state.activity);
  const manualPauseActive = useActivityStore((state) => state.manualPauseActive);
  const mode = useActivityStore((state) => state.mode);
  const message = useActivityStore((state) => state.message);
  const setMode = useActivityStore((state) => state.setMode);
  const setUserPaused = useActivityStore((state) => state.setUserPaused);
  const resetClassifications = useActivityStore((state) => state.resetClassifications);
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [runtimeError, setRuntimeError] = useState('');
  const nativeAvailable = isNativeRuntime();
  const userPaused = manualPauseActive;

  const updateManualPause = async () => {
    if (!nativeAvailable || runtimeBusy) return;
    const shouldPause = !userPaused;
    setRuntimeBusy(true);
    setRuntimeError('');
    try {
      if (shouldPause) {
        await runtimeService.pauseEnrichment();
      } else {
        await runtimeService.resumeEnrichment();
      }
      setUserPaused(shouldPause);
    } catch (error) {
      setRuntimeError(
        `Background work could not be ${shouldPause ? 'paused' : 'resumed'}: ${errorMessage(error)}`,
      );
    } finally {
      setRuntimeBusy(false);
    }
  };

  return (
    <SettingsPage>
      {import.meta.env.DEV ? (
        <div {...stylex.props(styles.stateToolbar)}>
          <LumenSelect<ActivityMode>
            aria-label="Development activity state"
            isDisabled={userPaused}
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
          <LumenButton isDisabled={userPaused} size="small" variant="quiet" onPress={resetClassifications}>
            Reset development state
          </LumenButton>
        </div>
      ) : null}
      <ActivityStatus mode={nativeAvailable ? userPaused ? 'user' : undefined : mode} />
      {runtimeError ? <SettingsCallout tone="error">{runtimeError}</SettingsCallout> : null}
      {message ? <SettingsCallout>{message}</SettingsCallout> : null}
      <SettingSection title="Manual control" description="Manual pause is the only connected activity policy in phase one.">
        <SettingRow
          label="Background indexing and enrichment"
          description={nativeAvailable
            ? 'Pausing stops native enrichment and new automatic index synchronization. Existing filename and matching-index search stay available.'
            : 'Manual background pause requires the native Windows app.'}
          status={<StatusBadge tone={nativeAvailable ? userPaused ? 'warning' : 'success' : 'neutral'}>
            {nativeAvailable ? userPaused ? 'Paused' : 'Available' : 'Unavailable'}
          </StatusBadge>}
        >
          <LumenButton
            isDisabled={!nativeAvailable || runtimeBusy}
            size="small"
            variant={userPaused ? 'primary' : 'subtle'}
            onPress={() => void updateManualPause()}
          >
            {runtimeBusy ? 'Working…' : userPaused ? 'Resume background work' : 'Pause background work'}
          </LumenButton>
        </SettingRow>
      </SettingSection>
      <SettingSection title="Automatic quiet modes" description="Windows activity detection is not connected in phase one. Stored values are preserved for compatibility.">
        <SettingRow label="Detect games automatically" description="No Windows game detector is connected." status={<StatusBadge tone="neutral">Unavailable</StatusBadge>}>
          <LumenSwitch aria-label="Detect games automatically" isDisabled isSelected={activity.detectGames} />
        </SettingRow>
        <SettingRow label="Detect fullscreen applications" description="No foreground-window detector is connected." status={<StatusBadge tone="neutral">Unavailable</StatusBadge>}>
          <LumenSwitch aria-label="Detect fullscreen applications" isDisabled isSelected={activity.detectFullscreen} />
        </SettingRow>
        <SettingRow label="Allow indexing during video" description="No media-playback detector is connected." status={<StatusBadge tone="neutral">Unavailable</StatusBadge>}>
          <LumenSwitch aria-label="Allow indexing during video" isDisabled isSelected={activity.allowDuringVideo} />
        </SettingRow>
        <SettingRow label="Metadata-only Cinema mode" description="Cinema scheduling has no native runtime consumer." status={<StatusBadge tone="neutral">Unavailable</StatusBadge>}>
          <LumenSwitch aria-label="Metadata-only Cinema mode" isDisabled isSelected={activity.cinemaMetadataOnly} />
        </SettingRow>
        <SettingRow label="Pause on battery" description="No Windows power-state monitor is connected." status={<StatusBadge tone="neutral">Unavailable</StatusBadge>}>
          <LumenSwitch aria-label="Pause on battery" isDisabled isSelected={activity.pauseOnBattery} />
        </SettingRow>
        <SettingRow label="Resume delay" description="Automatic resume requires an activity detector." status={<StatusBadge tone="neutral">Unavailable</StatusBadge>}>
          <LumenSelect
            aria-label="Resume delay"
            isDisabled
            options={[{id: '0', label: 'Immediately'}, {id: '15', label: '15 seconds'}, {id: '30', label: '30 seconds'}, {id: '60', label: '1 minute'}]}
            value={String(activity.resumeDelaySeconds) as '0' | '15' | '30' | '60'}
            onChange={() => undefined}
          />
        </SettingRow>
      </SettingSection>
      <SettingSection title="Application overrides" description="Stored overrides are preserved, but no process detector consumes them in phase one.">
        <div {...stylex.props(styles.addRow)}>
          <LumenTextField
            aria-label="Application override"
            isDisabled
            placeholder="Example: render.exe"
            value=""
            onChange={() => undefined}
          />
          <LumenButton aria-label="Add application override" isDisabled size="small"><PlusIcon aria-hidden="true" size={14} /> Unavailable</LumenButton>
        </div>
        {activity.overrides.map((override) => (
          <ApplicationOverrideRow
            isDisabled
            key={override.id}
            override={override}
            onChange={() => undefined}
            onRemove={() => undefined}
          />
        ))}
      </SettingSection>
      <SettingSection title="User-defined games" description="Stored entries are preserved, but no game detector consumes them in phase one.">
        <div {...stylex.props(styles.addRow)}>
          <LumenTextField aria-label="User-defined game" isDisabled placeholder="Example: game.exe" value="" onChange={() => undefined} />
          <LumenButton aria-label="Add user-defined game" isDisabled size="small"><GameControllerIcon aria-hidden="true" size={15} /> Unavailable</LumenButton>
        </div>
        {activity.userGames.length ? (
          <div {...stylex.props(styles.chips)}>
            {activity.userGames.map((game) => (
              <span key={game} {...stylex.props(styles.chip)}>
                {game}
                <LumenIconButton aria-label={`Remove game ${game}`} isDisabled size="small" variant="quiet">
                  <XIcon aria-hidden="true" size={11} />
                </LumenIconButton>
              </span>
            ))}
          </div>
        ) : <div {...stylex.props(styles.chips)}><LumenText tone="tertiary" variant="meta">No custom game classifications.</LumenText></div>}
      </SettingSection>
    </SettingsPage>
  );
}
