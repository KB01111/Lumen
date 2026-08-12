import {useCallback, useEffect, useState} from 'react';

import {McpIcon} from '../../../design-system/icons/lumen-icons';
import {LumenUiIcon} from '../../../design-system/icons/LumenUiIcon';
import {LumenButton} from '../../../design-system/primitives/LumenButton';
import {LumenText} from '../../../design-system/primitives/LumenText';
import {GatewayStatusPanel} from '../../gateway/GatewayStatusPanel';
import {useGatewayStore} from '../../gateway/gateway.store';
import {ProviderRouteList} from '../../gateway/ProviderRouteList';
import {ToolPermissionList} from '../../gateway/ToolPermissionList';
import {ConfirmationDialog} from '../components/ConfirmationDialog';
import {SettingSection} from '../components/SettingSection';
import {SettingsCallout, SettingsPage} from '../components/SettingsPage';
import {StatusBadge} from '../components/StatusBadge';
import {LumenTextField} from '../components/SettingsControls';
import {useSettingsStore} from '../settings.store';
import {isNativeRuntime, nativeAiService, type EnrichmentHealth, type GatewayHealth} from '../../../services/ai/native-ai-service';

export function AgentGatewayPage({nativeRuntime}: {nativeRuntime?: boolean} = {}) {
  const gatewayState = useGatewayStore((state) => state.gatewayState);
  const routes = useGatewayStore((state) => state.routes);
  const services = useGatewayStore((state) => state.mcpServices);
  const permissions = useGatewayStore((state) => state.permissions);
  const actionMessage = useGatewayStore((state) => state.actionMessage);
  const restart = useGatewayStore((state) => state.restart);
  const setRouteProvider = useGatewayStore((state) => state.setRouteProvider);
  const setPermission = useGatewayStore((state) => state.setPermission);
  const testProvider = useGatewayStore((state) => state.testProvider);
  const testMcp = useGatewayStore((state) => state.testMcp);
  const cloudConsent = useSettingsStore((state) => state.ai.cloudAnswerConsent);
  const runtimeMode = useSettingsStore((state) => state.ai.runtimeMode);
  const setCloudAnswerConsent = useSettingsStore((state) => state.setCloudAnswerConsent);
  const native = nativeRuntime ?? isNativeRuntime();
  const [health, setHealth] = useState<GatewayHealth>();
  const [enrichment, setEnrichment] = useState<EnrichmentHealth>();
  const [credential, setCredential] = useState('');
  const [nativeMessage, setNativeMessage] = useState('');
  const refresh = useCallback(async () => {
    if (!native) return;
    const [gateway, worker] = await Promise.all([
      nativeAiService.gatewayHealth(),
      nativeAiService.enrichmentHealth(),
    ]);
    setHealth(gateway);
    setEnrichment(worker);
  }, [native]);
  useEffect(() => {
    void refresh().catch((error: unknown) => setNativeMessage(String(error)));
  }, [refresh]);
  const changeCloudConsent = useCallback(async (granted: boolean) => {
    const saved = await setCloudAnswerConsent(granted);
    if (!saved) {
      setNativeMessage('Cloud consent was not changed because the device setting could not be saved.');
    }
  }, [setCloudAnswerConsent]);
  const grantCloudConsent = useCallback(() => {
    void changeCloudConsent(true);
  }, [changeCloudConsent]);
  const revokeCloudConsent = useCallback(async () => {
    if (runtimeMode === 'cloud') {
      const runtimeSaved = await useSettingsStore.getState().updateAi({runtimeMode: 'local'});
      if (!runtimeSaved) {
        setNativeMessage('Cloud consent was not changed because local mode could not be saved.');
        return;
      }
    }
    await changeCloudConsent(false);
  }, [changeCloudConsent, runtimeMode]);
  const restartGateway = async () => {
    if (!native) return restart();
    setNativeMessage('Restarting AgentGateway…');
    try {
      await nativeAiService.restartGateway();
      await refresh();
      setNativeMessage('AgentGateway restarted.');
    } catch (error) {
      setNativeMessage(error instanceof Error ? error.message : String(error));
    }
  };
  const saveCredential = async () => {
    if (!credential.trim()) return;
    try {
      await nativeAiService.saveCredential('openai', credential);
      await nativeAiService.restartGateway();
      await refresh();
      setNativeMessage('OpenAI credential saved in Windows Credential Manager.');
    } catch (error) {
      setNativeMessage(`The OpenAI credential could not be saved or activated: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCredential('');
    }
  };
  const deleteCredential = async () => {
    try {
      await nativeAiService.deleteCredential('openai');
      await refresh();
      setNativeMessage('OpenAI credential removed.');
    } catch (error) {
      setNativeMessage(`The OpenAI credential may still be configured: ${error instanceof Error ? error.message : String(error)}`);
      await refresh().catch(() => undefined);
    }
  };

  return (
    <SettingsPage>
      <GatewayStatusPanel state={health?.state ?? gatewayState} onRestart={() => void restartGateway()} />
      <SettingsCallout>
        {health
          ? `AgentGateway ${health.version} · interactive 60 req/min and 100k tokens/hour · enrichment 10 req/min and 500k tokens/day.`
          : 'AgentGateway stays behind Rust IPC; the webview has no direct network route.'}
      </SettingsCallout>
      {nativeMessage || actionMessage ? <SettingsCallout>{nativeMessage || actionMessage}</SettingsCallout> : null}
      <SettingSection title="Virtual model routes" description="Stable aliases keep callers unchanged while providers change underneath.">
        {native ? [
          'lumen.answer.local', 'lumen.answer.cloud', 'lumen.embed.local', 'lumen.embed.cloud',
          'lumen.vision.cloud', 'lumen.audio.cloud', 'lumen.rerank.cloud',
        ].map((alias) => (
          <div key={alias} className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-border-subtle p-5 last:border-b-0">
            <LumenText weight="medium">{alias}</LumenText>
            <LumenText tone="tertiary" variant="meta">Generated, secret-free route</LumenText>
            <StatusBadge tone={alias.endsWith('.local') ? 'info' : health?.cloudCredentialConfigured && cloudConsent ? 'success' : 'warning'}>
              {alias.endsWith('.local') ? 'Local' : !cloudConsent ? 'Needs consent' : health?.cloudCredentialConfigured ? 'Ready' : 'Needs key'}
            </StatusBadge>
          </div>
        )) : <ProviderRouteList routes={routes} onChange={setRouteProvider} onTest={(id) => void testProvider(id)} />}
      </SettingSection>
      {native ? (
        <SettingSection title="Provider credential" description="The value is written directly to Windows Credential Manager and never returned to React.">
          <div className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-border-subtle p-5 last:border-b-0">
            <LumenUiIcon className="text-accent" name="success" size="medium" />
            <LumenTextField aria-label="OpenAI API key" type="password" placeholder="sk-…" value={credential} onChange={setCredential} />
            <div className="flex flex-wrap items-center gap-3">
              <LumenButton size="small" variant="primary" onPress={() => void saveCredential()}>Save</LumenButton>
              <LumenButton size="small" variant="quiet" onPress={() => void deleteCredential()}>Delete</LumenButton>
            </div>
          </div>
        </SettingSection>
      ) : null}
      <SettingSection title="Cloud consent" description="Cloud routes stay unavailable until this device records explicit consent.">
        <div className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-border-subtle p-5 last:border-b-0">
          <LumenUiIcon className="text-accent" name="success" size="medium" />
          <div className="grid gap-1">
            <LumenText weight="medium">Provider requests</LumenText>
            <LumenText tone="tertiary" variant="meta">Search queries, filenames, and relevant indexed excerpts may leave this device after consent.</LumenText>
          </div>
          {cloudConsent ? (
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge tone="success">Cloud consent granted</StatusBadge>
              <LumenButton size="small" variant="quiet" onPress={() => void revokeCloudConsent()}>Revoke</LumenButton>
            </div>
          ) : (
            <ConfirmationDialog
              confirmLabel="Allow cloud requests"
              confirmVariant="primary"
              description="Cloud answers may send the current search query and relevant local index excerpts, including filenames, to the configured provider. Local mode remains on this PC."
              title="Allow cloud provider requests?"
              onConfirm={grantCloudConsent}
            >
              <LumenButton aria-label="Review cloud consent" size="small">Review consent</LumenButton>
            </ConfirmationDialog>
          )}
        </div>
      </SettingSection>
      {native ? (
        <SettingSection title="Durable enrichment queue" description="Rivet Actors owns idempotent OCR and transcription job leases when its Windows engine is healthy.">
          <div className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-border-subtle p-5 last:border-b-0">
            <LumenUiIcon className="text-accent" name="connect" size="medium" />
            <div className="grid gap-1">
              <LumenText weight="medium">Rivet worker</LumenText>
              <LumenText tone="tertiary" variant="meta">{enrichment?.detail ?? (enrichment?.paused ? 'Queue paused' : 'Loopback-only worker')}</LumenText>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge tone={enrichment?.state === 'ready' ? 'success' : 'warning'}>{enrichment?.state ?? 'Checking'}</StatusBadge>
              <LumenButton size="small" variant="quiet" onPress={() => void (enrichment?.paused ? nativeAiService.resumeEnrichment() : nativeAiService.pauseEnrichment()).then(refresh)}>{enrichment?.paused ? 'Resume' : 'Pause'}</LumenButton>
            </div>
          </div>
        </SettingSection>
      ) : null}
      {!native ? (
        <>
          <SettingSection title="MCP services" description="Development previews for service and tool-count states.">
            {services.map((service) => (
              <div key={service.id} className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-border-subtle p-5 last:border-b-0">
                <McpIcon className="text-accent" size={20} />
                <div className="grid gap-1">
                  <LumenText weight="medium">{service.name}</LumenText>
                  <LumenText tone="tertiary" variant="meta">
                    {service.status === 'connected' ? `${service.toolCount} preview tools` : service.status === 'testing' ? 'Testing preview…' : 'Service unavailable'}
                  </LumenText>
                </div>
                <LumenButton aria-label={`Test ${service.name}`} size="small" variant="quiet" onPress={() => void testMcp(service.id)}>Test</LumenButton>
              </div>
            ))}
          </SettingSection>
          <SettingSection title="Tool permissions" description="Development preview of local tool policies.">
            <ToolPermissionList permissions={permissions} onChange={setPermission} />
          </SettingSection>
        </>
      ) : null}
    </SettingsPage>
  );
}
