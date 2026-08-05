import {useCallback, useEffect, useState} from 'react';

import {BugIcon, CloudCheckIcon, PlugsConnectedIcon} from '@phosphor-icons/react';
import * as stylex from '@stylexjs/stylex';

import {McpIcon} from '../../../design-system/icons/lumen-icons';
import {LumenButton} from '../../../design-system/primitives/LumenButton';
import {LumenText} from '../../../design-system/primitives/LumenText';
import {tokens} from '../../../design-system/tokens.stylex';
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

const styles = stylex.create({
  mcpRow: {
    minHeight: '64px',
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: tokens.space6,
    padding: tokens.space8,
    borderBottomColor: tokens.colorBorderSubtle,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    ':last-child': {borderBottomWidth: 0},
  },
  mcpIcon: {color: tokens.colorAccent},
  mcpText: {display: 'grid', gap: tokens.space2},
  actions: {display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: tokens.space5},
});

export function AgentGatewayPage() {
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
  const native = isNativeRuntime();
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
      <SettingSection title="Virtual model routes" description="Aliases let future callers use a stable name while providers change underneath.">
        {native ? [
          'lumen.answer.local', 'lumen.answer.cloud', 'lumen.embed.local', 'lumen.embed.cloud',
          'lumen.vision.cloud', 'lumen.audio.cloud', 'lumen.rerank.cloud',
        ].map((alias) => (
          <div key={alias} {...stylex.props(styles.mcpRow)}>
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
          <div {...stylex.props(styles.mcpRow)}>
            <CloudCheckIcon aria-hidden="true" size={20} {...stylex.props(styles.mcpIcon)} />
            <LumenTextField aria-label="OpenAI API key" type="password" placeholder="sk-…" value={credential} onChange={setCredential} />
            <div {...stylex.props(styles.actions)}>
              <LumenButton size="small" variant="primary" onPress={() => void saveCredential()}>Save</LumenButton>
              <LumenButton size="small" variant="quiet" onPress={() => void deleteCredential()}>Delete</LumenButton>
            </div>
          </div>
        </SettingSection>
      ) : null}
      <SettingSection title="Cloud consent" description="Cloud routes stay unavailable until this device records explicit consent.">
        <div {...stylex.props(styles.mcpRow)}>
          <CloudCheckIcon aria-hidden="true" size={20} {...stylex.props(styles.mcpIcon)} />
          <div {...stylex.props(styles.mcpText)}>
            <LumenText weight="medium">Provider requests</LumenText>
            <LumenText tone="tertiary" variant="meta">Search queries, filenames, and relevant indexed excerpts may leave this device after consent.</LumenText>
          </div>
          {cloudConsent ? (
            <div {...stylex.props(styles.actions)}>
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
          <div {...stylex.props(styles.mcpRow)}>
            <PlugsConnectedIcon aria-hidden="true" size={20} {...stylex.props(styles.mcpIcon)} />
            <div {...stylex.props(styles.mcpText)}>
              <LumenText weight="medium">Rivet worker</LumenText>
              <LumenText tone="tertiary" variant="meta">{enrichment?.detail ?? (enrichment?.paused ? 'Queue paused' : 'Loopback-only worker')}</LumenText>
            </div>
            <div {...stylex.props(styles.actions)}>
              <StatusBadge tone={enrichment?.state === 'ready' ? 'success' : 'warning'}>{enrichment?.state ?? 'Checking'}</StatusBadge>
              <LumenButton size="small" variant="quiet" onPress={() => void (enrichment?.paused ? nativeAiService.resumeEnrichment() : nativeAiService.pauseEnrichment()).then(refresh)}>{enrichment?.paused ? 'Resume' : 'Pause'}</LumenButton>
            </div>
          </div>
        </SettingSection>
      ) : null}
      <SettingSection title="MCP services" description="Visible service and tool counts make unavailable states explicit.">
        {services.map((service) => (
          <div key={service.id} {...stylex.props(styles.mcpRow)}>
            <McpIcon className={stylex.props(styles.mcpIcon).className} size={20} />
            <div {...stylex.props(styles.mcpText)}>
              <LumenText weight="medium">{service.name}</LumenText>
              <LumenText tone="tertiary" variant="meta">
                {service.status === 'connected' ? `${service.toolCount} preview tools` : service.status === 'testing' ? 'Testing preview…' : 'Service unavailable'}
              </LumenText>
            </div>
            <LumenButton aria-label={`Test ${service.name}`} size="small" variant="quiet" onPress={() => void testMcp(service.id)}>Test</LumenButton>
          </div>
        ))}
      </SettingSection>
      <SettingSection title="Tool permissions" description="Every future tool call has one explicit local permission policy.">
        <ToolPermissionList permissions={permissions} onChange={setPermission} />
      </SettingSection>
      <SettingSection title="Sanitized diagnostics">
        <div {...stylex.props(styles.mcpRow)}>
          <BugIcon aria-hidden="true" size={20} {...stylex.props(styles.mcpIcon)} />
          <div {...stylex.props(styles.mcpText)}>
            <LumenText weight="medium">Gateway support snapshot</LumenText>
            <LumenText tone="tertiary" variant="meta">Routes and states only. Secrets, prompts, and local paths are omitted.</LumenText>
          </div>
          <LumenButton size="small" variant="quiet"><PlugsConnectedIcon aria-hidden="true" size={15} /> Preview</LumenButton>
        </div>
      </SettingSection>
    </SettingsPage>
  );
}
