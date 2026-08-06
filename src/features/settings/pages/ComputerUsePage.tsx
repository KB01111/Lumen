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
type ComputerUseSettingsService = Pick<TauriComputerUseService, 'cancelActive' | 'health'>;

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

export function ComputerUsePage({service = computerUseService}: {service?: ComputerUseSettingsService}) {
  const settings = useSettingsStore((state) => state.computerUse);
  const updateComputerUse = useSettingsStore((state) => state.updateComputerUse);
  const setComputerUseConsent = useSettingsStore((state) => state.setComputerUseConsent);
  const native = isNativeRuntime();
  const [health, setHealth] = useState<ComputerUseHealth>();
  const [credential, setCredential] = useState('');
  const [initialUrl, setInitialUrl] = useState(settings.initialUrl);
  const [message, setMessage] = useState('');
  const refresh = useCallback(async () => {
    if (!native) return;
    setHealth(await service.health());
  }, [native, service]);

  useEffect(() => {
    void refresh().catch((error: unknown) => setMessage(String(error)));
  }, [refresh]);

  useEffect(() => {
    setInitialUrl(settings.initialUrl);
  }, [settings.initialUrl]);

  const saveCredential = async () => {
    if (!credential.trim()) return;
    try {
      await nativeAiService.saveCredential('gemini', credential);
      await refresh();
      setMessage('Gemini API key saved in Windows Credential Manager.');
    } catch (error) {
      setMessage(`The Gemini credential could not be saved: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCredential('');
    }
  };
  const deleteCredential = async () => {
    try {
      await nativeAiService.deleteCredential('gemini');
      await refresh();
      setMessage('Gemini API key removed.');
    } catch (error) {
      setMessage(`The Gemini credential may still be configured: ${error instanceof Error ? error.message : String(error)}`);
      await refresh().catch(() => undefined);
    }
  };
  const saveInitialUrl = async () => {
    if (!native) return;
    if (!validWebUrl(initialUrl)) {
      setMessage('The start page must be an absolute HTTP or HTTPS URL.');
      return;
    }
    const previous = settings.initialUrl;
    if (await updateComputerUse({initialUrl})) {
      setMessage('Computer Use start page saved.');
      return;
    }
    useSettingsStore.setState((state) => ({
      computerUse: {...state.computerUse, initialUrl: previous},
    }));
    setInitialUrl(previous);
    setMessage('The Computer Use start page was not saved. Your previous start page remains active.');
  };
  const saveModel = async (model: ComputerUseModel) => {
    if (!native) return;
    const previous = settings.model;
    if (await updateComputerUse({model})) return;
    useSettingsStore.setState((state) => ({
      computerUse: {...state.computerUse, model: previous},
    }));
    setMessage('The Computer Use model was not saved. Your previous model remains active.');
  };
  const grantConsent = async () => {
    if (!native) return;
    const saved = await setComputerUseConsent(true);
    setMessage(saved
      ? 'Computer Use cloud consent granted for this device.'
      : 'Computer Use consent was not granted because the device setting could not be saved.');
  };
  const revokeConsent = async () => {
    const saved = await setComputerUseConsent(false);
    if (!saved) {
      setMessage('Computer Use consent was not revoked because the device setting could not be saved.');
      return;
    }
    if (!native) return;
    try {
      await service.cancelActive();
      setMessage('Computer Use consent revoked. Any active browser task was stopped.');
    } catch (error) {
      setMessage(`Computer Use consent was revoked, but the active task could not be stopped: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <SettingsPage>
      <SettingsCallout>
        {native
          ? 'Computer Use runs a separate Microsoft Edge session. The Gemini key stays in Windows Credential Manager; tasks and browser screenshots leave this device only after explicit consent.'
          : 'Computer Use requires the native Windows app. Browser preview mode cannot inspect a worker, store a Gemini credential, or start a browser task.'}
      </SettingsCallout>
      {message ? <SettingsCallout>{message}</SettingsCallout> : null}
      <SettingSection title="Runtime" description="Lumen supervises a fixed, browser-only sidecar and stops it with the app.">
        <SettingRow
          label="Computer Use worker"
          description={native
            ? health?.detail ?? `${health?.browser ?? 'Microsoft Edge'} · ${health?.mode ?? 'checking'} runtime`
            : 'Worker health is available only through the native Rust boundary.'}
          status={<StatusBadge tone={native && health?.state === 'ready' ? 'success' : 'warning'}>{native ? health?.state ?? 'Checking' : 'Unavailable'}</StatusBadge>}
        >
          <LumenButton isDisabled={!native} size="small" variant="quiet" onPress={() => void refresh()}>
            <BrowserIcon aria-hidden="true" size={15} /> Check
          </LumenButton>
        </SettingRow>
        <SettingRow label="Gemini model" description="Only models exposed by the pinned Computer Use Preview adapter are selectable.">
          <LumenSelect
            aria-label="Computer Use model"
            isDisabled={!native}
            options={modelOptions}
            value={settings.model}
            onChange={(model: ComputerUseModel) => void saveModel(model)}
          />
        </SettingRow>
        <SettingRow label="Start page" description="Every task starts in a fresh Edge context at this HTTP or HTTPS address.">
          <div {...stylex.props(styles.actions, styles.wideControl)}>
            <LumenTextField aria-label="Computer Use start page" isDisabled={!native} value={initialUrl} onChange={setInitialUrl} />
            <LumenButton aria-label="Save Computer Use start page" isDisabled={!native} size="small" variant="quiet" onPress={() => void saveInitialUrl()}>Save</LumenButton>
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
              <LumenButton aria-label="Save Gemini API key" size="small" variant="primary" onPress={() => void saveCredential()}>Save</LumenButton>
              <LumenButton aria-label="Delete Gemini API key" size="small" variant="quiet" onPress={() => void deleteCredential()}>Delete</LumenButton>
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
          {!native ? (
            <StatusBadge tone="warning">Native only</StatusBadge>
          ) : settings.cloudConsent ? (
            <div {...stylex.props(styles.actions)}>
              <StatusBadge tone="success">Consent granted</StatusBadge>
              <LumenButton size="small" variant="quiet" onPress={() => void revokeConsent()}>Revoke</LumenButton>
            </div>
          ) : (
            <ConfirmationDialog
              confirmLabel="Allow Computer Use"
              confirmVariant="primary"
              description="Gemini will receive your browser task, visited page URLs, and screenshots from a fresh Microsoft Edge session. Model-requested sensitive actions still require separate approval."
              title="Allow Gemini Computer Use?"
              onConfirm={() => void grantConsent()}
            >
              <LumenButton aria-label="Review Computer Use consent" size="small">Review consent</LumenButton>
            </ConfirmationDialog>
          )}
        </div>
      </SettingSection>
    </SettingsPage>
  );
}
