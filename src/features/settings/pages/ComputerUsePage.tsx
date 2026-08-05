import {useCallback, useEffect, useState} from 'react';

import {BrowserIcon, CloudCheckIcon, KeyIcon} from '@phosphor-icons/react';
import * as stylex from '@stylexjs/stylex';

import {LumenButton} from '../../../design-system/primitives/LumenButton';
import {LumenText} from '../../../design-system/primitives/LumenText';
import {tokens} from '../../../design-system/tokens.stylex';
import {isNativeRuntime, nativeAiService} from '../../../services/ai/native-ai-service';
import {TauriComputerUseService} from '../../../services/computer-use/tauri-computer-use-service';
import {
  computerUseModels,
  type ComputerUseHealth,
  type ComputerUseModel,
} from '../../../services/computer-use/computer-use.types';
import {ConfirmationDialog} from '../components/ConfirmationDialog';
import {SettingRow} from '../components/SettingRow';
import {SettingSection} from '../components/SettingSection';
import {LumenSelect, LumenTextField} from '../components/SettingsControls';
import {SettingsCallout, SettingsPage} from '../components/SettingsPage';
import {StatusBadge} from '../components/StatusBadge';
import {useSettingsStore} from '../settings.store';

const computerUseService = new TauriComputerUseService();

const styles = stylex.create({
  credential: {
    minHeight: '64px',
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: tokens.space6,
    padding: tokens.space8,
  },
  icon: {color: tokens.colorAccent},
  text: {display: 'grid', gap: tokens.space2},
  actions: {display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: tokens.space4},
  wideControl: {width: '260px'},
});

const modelOptions = computerUseModels.map((model) => ({id: model, label: model}));

function validWebUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && url.hostname.length > 0
      && url.username.length === 0
      && url.password.length === 0;
  } catch {
    return false;
  }
}

export function ComputerUsePage() {
  const settings = useSettingsStore((state) => state.computerUse);
  const updateComputerUse = useSettingsStore((state) => state.updateComputerUse);
  const native = isNativeRuntime();
  const [health, setHealth] = useState<ComputerUseHealth>();
  const [credential, setCredential] = useState('');
  const [initialUrl, setInitialUrl] = useState(settings.initialUrl);
  const [message, setMessage] = useState('');
  const refresh = useCallback(async () => {
    if (!native) return;
    setHealth(await computerUseService.health());
  }, [native]);

  useEffect(() => {
    void refresh().catch((error: unknown) => setMessage(String(error)));
  }, [refresh]);

  const saveCredential = async () => {
    if (!credential.trim()) return;
    await nativeAiService.saveCredential('gemini', credential);
    setCredential('');
    await refresh();
    setMessage('Gemini API key saved in Windows Credential Manager.');
  };
  const deleteCredential = async () => {
    await nativeAiService.deleteCredential('gemini');
    await refresh();
    setMessage('Gemini API key removed.');
  };
  const saveInitialUrl = async () => {
    if (!validWebUrl(initialUrl)) {
      setMessage('The start page must be an absolute HTTP or HTTPS URL.');
      return;
    }
    await updateComputerUse({initialUrl});
    setMessage('Computer Use start page saved.');
  };
  const grantConsent = () => void updateComputerUse({cloudConsent: true});
  const revokeConsent = () => void updateComputerUse({cloudConsent: false});

  return (
    <SettingsPage>
      <SettingsCallout>
        Computer Use runs a separate Microsoft Edge session. The Gemini key stays in Windows Credential Manager; tasks and browser screenshots leave this device only after explicit consent.
      </SettingsCallout>
      {message ? <SettingsCallout>{message}</SettingsCallout> : null}
      <SettingSection title="Runtime" description="Lumen supervises a fixed, browser-only sidecar and stops it with the app.">
        <SettingRow
          label="Computer Use worker"
          description={health?.detail ?? `${health?.browser ?? 'Microsoft Edge'} · ${health?.mode ?? 'checking'} runtime`}
          status={<StatusBadge tone={health?.state === 'ready' ? 'success' : 'warning'}>{health?.state ?? 'Checking'}</StatusBadge>}
        >
          <LumenButton size="small" variant="quiet" onPress={() => void refresh()}>
            <BrowserIcon aria-hidden="true" size={15} /> Check
          </LumenButton>
        </SettingRow>
        <SettingRow label="Gemini model" description="Only models exposed by the pinned Computer Use Preview adapter are selectable.">
          <LumenSelect
            aria-label="Computer Use model"
            options={modelOptions}
            value={settings.model}
            onChange={(model: ComputerUseModel) => void updateComputerUse({model})}
          />
        </SettingRow>
        <SettingRow label="Start page" description="Every task starts in a fresh Edge context at this HTTP or HTTPS address.">
          <div {...stylex.props(styles.actions, styles.wideControl)}>
            <LumenTextField aria-label="Computer Use start page" value={initialUrl} onChange={setInitialUrl} />
            <LumenButton size="small" variant="quiet" onPress={() => void saveInitialUrl()}>Save</LumenButton>
          </div>
        </SettingRow>
      </SettingSection>
      {native ? (
        <SettingSection title="Gemini credential" description="The secret is written directly to Windows Credential Manager and never returned to React.">
          <div {...stylex.props(styles.credential)}>
            <KeyIcon aria-hidden="true" size={20} {...stylex.props(styles.icon)} />
            <div {...stylex.props(styles.text)}>
              <LumenText weight="medium">Gemini API key</LumenText>
              <LumenText tone="tertiary" variant="meta">
                {health?.credentialConfigured ? 'A key is configured for this Windows account.' : 'No Gemini key is configured.'}
              </LumenText>
              <LumenTextField aria-label="Gemini API key" type="password" placeholder="Enter API key" value={credential} onChange={setCredential} />
            </div>
            <div {...stylex.props(styles.actions)}>
              <LumenButton size="small" variant="primary" onPress={() => void saveCredential()}>Save</LumenButton>
              <LumenButton size="small" variant="quiet" onPress={() => void deleteCredential()}>Delete</LumenButton>
            </div>
          </div>
        </SettingSection>
      ) : null}
      <SettingSection title="Cloud consent" description="Consent is device-local and can be revoked at any time.">
        <div {...stylex.props(styles.credential)}>
          <CloudCheckIcon aria-hidden="true" size={20} {...stylex.props(styles.icon)} />
          <div {...stylex.props(styles.text)}>
            <LumenText weight="medium">Browser task requests</LumenText>
            <LumenText tone="tertiary" variant="meta">The task, page URL, and screenshots are sent to Gemini. Passwords and payment details may be visible if you navigate to them.</LumenText>
          </div>
          {settings.cloudConsent ? (
            <div {...stylex.props(styles.actions)}>
              <StatusBadge tone="success">Consent granted</StatusBadge>
              <LumenButton size="small" variant="quiet" onPress={revokeConsent}>Revoke</LumenButton>
            </div>
          ) : (
            <ConfirmationDialog
              confirmLabel="Allow Computer Use"
              confirmVariant="primary"
              description="Gemini will receive your browser task, visited page URLs, and screenshots from a fresh Microsoft Edge session. Model-requested sensitive actions still require separate approval."
              title="Allow Gemini Computer Use?"
              onConfirm={grantConsent}
            >
              <LumenButton aria-label="Review Computer Use consent" size="small">Review consent</LumenButton>
            </ConfirmationDialog>
          )}
        </div>
      </SettingSection>
    </SettingsPage>
  );
}
