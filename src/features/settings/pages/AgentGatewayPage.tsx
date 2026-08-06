import {useCallback, useEffect, useState} from 'react';

import {BugIcon, CloudCheckIcon, PlugsConnectedIcon} from '@phosphor-icons/react';
import * as stylex from '@stylexjs/stylex';

import {McpIcon} from '../../../design-system/icons/lumen-icons';
import {LumenButton} from '../../../design-system/primitives/LumenButton';
import {LumenText} from '../../../design-system/primitives/LumenText';
import {tokens} from '../../../design-system/tokens.stylex';
import {isNativeRuntime, nativeAiService} from '../../../services/ai/native-ai-service';
import {GatewayStatusPanel} from '../../gateway/GatewayStatusPanel';
import {useGatewayStore} from '../../gateway/gateway.store';
import {useNativeGatewayHealthStore} from '../../gateway/native-gateway-health.store';
import {ProviderRouteList} from '../../gateway/ProviderRouteList';
import {ToolPermissionList} from '../../gateway/ToolPermissionList';
import {ConfirmationDialog} from '../components/ConfirmationDialog';
import {SettingSection} from '../components/SettingSection';
import {SettingsCallout, SettingsPage} from '../components/SettingsPage';
import {StatusBadge} from '../components/StatusBadge';
import {LumenTextField} from '../components/SettingsControls';
import {useSettingsStore} from '../settings.store';

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

const nativeMcpCapabilities = [
  {id: 'connections', label: 'MCP service connections', description: 'No MCP server is connected to this native build.', badge: 'Not connected'},
  {id: 'tools', label: 'MCP tool execution', description: 'Tool execution is unavailable until a native MCP boundary is implemented.', badge: 'Unavailable'},
] as const;

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
  const health = useNativeGatewayHealthStore((state) => state.gateway);
  const enrichment = useNativeGatewayHealthStore((state) => state.enrichment);
  const setNativeHealth = useNativeGatewayHealthStore((state) => state.setHealth);
  const cloudConsent = useSettingsStore((state) => state.ai.cloudAnswerConsent);
  const setCloudAnswerConsent = useSettingsStore((state) => state.setCloudAnswerConsent);
  const native = isNativeRuntime();
  const [credential, setCredential] = useState('');
  const [nativeMessage, setNativeMessage] = useState('');
  const [gatewayBusy, setGatewayBusy] = useState(false);
  const [enrichmentBusy, setEnrichmentBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!native) return {gateway: false, enrichment: false};
    const [gatewayResult, enrichmentResult] = await Promise.allSettled([
      nativeAiService.gatewayHealth(),
      nativeAiService.enrichmentHealth(),
    ]);
    const nextGateway = gatewayResult.status === 'fulfilled' ? gatewayResult.value : null;
    const nextEnrichment = enrichmentResult.status === 'fulfilled' ? enrichmentResult.value : null;
    setNativeHealth(nextGateway, nextEnrichment);
    return {gateway: nextGateway !== null, enrichment: nextEnrichment !== null};
  }, [native, setNativeHealth]);

  useEffect(() => {
    void refresh().then((result) => {
      if (native && !result.gateway) {
        setNativeMessage('AgentGateway health could not be retrieved. Native AI routes are shown as unavailable.');
      }
    });
  }, [native, refresh]);

  const changeCloudConsent = useCallback(async (granted: boolean) => {
    const saved = await setCloudAnswerConsent(granted);
    if (!saved) {
      setNativeMessage('Cloud consent was not changed because the device setting could not be saved.');
    }
    return saved;
  }, [setCloudAnswerConsent]);
  const grantCloudConsent = useCallback(() => {
    void changeCloudConsent(true);
  }, [changeCloudConsent]);
  const revokeCloudConsent = useCallback(async () => {
    const saved = await changeCloudConsent(false);
    if (!saved || !native) return;
    try {
      await nativeAiService.cancelCloudAnswers();
      setNativeMessage('Cloud consent revoked. Any active cloud answer was stopped.');
    } catch {
      setNativeMessage('Cloud consent was revoked, but an active cloud answer could not be stopped.');
    }
  }, [changeCloudConsent, native]);

  const restartGateway = async () => {
    if (!native) return restart();
    if (gatewayBusy) return;
    setGatewayBusy(true);
    setNativeMessage('Restarting AgentGateway…');
    try {
      await nativeAiService.restartGateway();
      const result = await refresh();
      setNativeMessage(result.gateway
        ? 'AgentGateway restarted and its health was refreshed.'
        : 'AgentGateway restarted, but its health could not be retrieved.');
    } catch {
      await refresh();
      setNativeMessage('AgentGateway could not be restarted. The last available health state is shown.');
    } finally {
      setGatewayBusy(false);
    }
  };

  const saveCredential = async () => {
    if (!credential.trim() || gatewayBusy) return;
    setGatewayBusy(true);
    try {
      await nativeAiService.saveCredential('openai', credential);
      await nativeAiService.restartGateway();
      const result = await refresh();
      setNativeMessage(result.gateway
        ? 'OpenAI credential saved in Windows Credential Manager and AgentGateway was refreshed.'
        : 'The credential was saved, but AgentGateway health could not be retrieved.');
    } catch {
      setNativeMessage('The OpenAI credential could not be saved or activated.');
    } finally {
      setCredential('');
      setGatewayBusy(false);
    }
  };

  const deleteCredential = async () => {
    if (gatewayBusy) return;
    setGatewayBusy(true);
    try {
      await nativeAiService.deleteCredential('openai');
      await nativeAiService.restartGateway();
      const result = await refresh();
      setNativeMessage(result.gateway
        ? 'OpenAI credential removed and AgentGateway restarted.'
        : 'The credential was removed, but AgentGateway health could not be retrieved.');
    } catch {
      await refresh();
      setNativeMessage('The OpenAI credential may still be configured.');
    } finally {
      setGatewayBusy(false);
    }
  };

  const toggleEnrichment = async () => {
    if (!enrichment || enrichment.processorState !== 'ready' || enrichmentBusy) return;
    setEnrichmentBusy(true);
    try {
      if (enrichment.paused) await nativeAiService.resumeEnrichment();
      else await nativeAiService.pauseEnrichment();
      const result = await refresh();
      setNativeMessage(result.enrichment
        ? `Enrichment queue ${enrichment.paused ? 'resumed' : 'paused'} and its health was refreshed.`
        : 'The enrichment queue changed state, but its health could not be retrieved.');
    } catch {
      await refresh();
      setNativeMessage(`The enrichment queue could not be ${enrichment.paused ? 'resumed' : 'paused'}.`);
    } finally {
      setEnrichmentBusy(false);
    }
  };

  const restartEnrichmentCoordinator = async () => {
    if (enrichmentBusy) return;
    setEnrichmentBusy(true);
    try {
      await nativeAiService.restartEnrichment();
      const result = await refresh();
      setNativeMessage(result.enrichment
        ? 'Rivet coordination restarted and enrichment health was refreshed.'
        : 'Rivet coordination restarted, but enrichment health could not be retrieved.');
    } catch {
      await refresh();
      setNativeMessage('Rivet coordination could not be restarted. The SQLite enrichment processor remains independently supervised.');
    } finally {
      setEnrichmentBusy(false);
    }
  };

  const nativeGatewayState = health?.state ?? 'unavailable';
  const nativeRoutesAvailable = health?.state === 'ready';

  return (
    <SettingsPage>
      <GatewayStatusPanel state={native ? nativeGatewayState : gatewayState} onRestart={() => void restartGateway()} />
      <SettingsCallout>
        {native
          ? health
            ? `AgentGateway ${health.version} · interactive ${health.interactivePort} · enrichment ${health.enrichmentPort}.`
            : 'AgentGateway stays behind Rust IPC. Native health is currently unavailable; the webview has no direct network route.'
          : 'AgentGateway stays behind Rust IPC; the webview has no direct network route.'}
      </SettingsCallout>
      {nativeMessage || (!native && actionMessage) ? <SettingsCallout>{native ? nativeMessage : actionMessage}</SettingsCallout> : null}
      <SettingSection title="Virtual model routes" description="Aliases let future callers use a stable name while providers change underneath.">
        {native ? [
          'lumen.answer.local', 'lumen.answer.cloud', 'lumen.embed.local', 'lumen.embed.cloud',
          'lumen.vision.cloud', 'lumen.audio.cloud', 'lumen.rerank.cloud',
        ].map((alias) => {
          const local = alias.endsWith('.local');
          const cloudReady = nativeRoutesAvailable && health?.cloudCredentialConfigured && cloudConsent;
          const ready = local ? nativeRoutesAvailable : cloudReady;
          return (
            <div key={alias} {...stylex.props(styles.mcpRow)}>
              <LumenText weight="medium">{alias}</LumenText>
              <LumenText tone="tertiary" variant="meta">Generated, secret-free route alias</LumenText>
              <StatusBadge tone={ready ? (local ? 'info' : 'success') : 'warning'}>
                {ready ? (local ? 'Available' : 'Ready') : !nativeRoutesAvailable ? 'Unavailable' : !cloudConsent ? 'Needs consent' : 'Needs key'}
              </StatusBadge>
            </div>
          );
        }) : <ProviderRouteList routes={routes} onChange={setRouteProvider} onTest={(id) => void testProvider(id)} />}
      </SettingSection>
      {native ? (
        <SettingSection title="Provider credential" description="The value is written directly to Windows Credential Manager and never returned to React.">
          <div {...stylex.props(styles.mcpRow)}>
            <CloudCheckIcon aria-hidden="true" size={20} {...stylex.props(styles.mcpIcon)} />
            <LumenTextField aria-label="OpenAI API key" type="password" placeholder="sk-…" value={credential} onChange={setCredential} />
            <div {...stylex.props(styles.actions)}>
              <LumenButton isDisabled={gatewayBusy} size="small" variant="primary" onPress={() => void saveCredential()}>Save</LumenButton>
              <LumenButton isDisabled={gatewayBusy} size="small" variant="quiet" onPress={() => void deleteCredential()}>Delete</LumenButton>
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
        <SettingSection title="Durable enrichment queue" description="SQLite owns idempotent OCR and transcription leases; Rivet coordinates native worker wakeups when its Windows engine is healthy.">
          <div {...stylex.props(styles.mcpRow)}>
            <PlugsConnectedIcon aria-hidden="true" size={20} {...stylex.props(styles.mcpIcon)} />
            <div {...stylex.props(styles.mcpText)}>
              <LumenText weight="medium">SQLite enrichment processor</LumenText>
              <LumenText tone="tertiary" variant="meta">{enrichment?.processorDetail ?? (enrichment ? (enrichment.paused ? 'Queue paused' : 'Durable provider processing is available.') : 'Native enrichment health is unavailable.')}</LumenText>
            </div>
            <div {...stylex.props(styles.actions)}>
              <StatusBadge tone={enrichment?.processorState === 'ready' ? 'success' : 'warning'}>{enrichment?.processorState ?? 'Unavailable'}</StatusBadge>
              <LumenButton isDisabled={enrichmentBusy || enrichment?.processorState !== 'ready'} size="small" variant="quiet" onPress={() => void toggleEnrichment()}>{enrichment?.paused ? 'Resume' : 'Pause'}</LumenButton>
            </div>
          </div>
          <div {...stylex.props(styles.mcpRow)}>
            <PlugsConnectedIcon aria-hidden="true" size={20} {...stylex.props(styles.mcpIcon)} />
            <div {...stylex.props(styles.mcpText)}>
              <LumenText weight="medium">Rivet coordinator</LumenText>
              <LumenText tone="tertiary" variant="meta">{enrichment?.coordinatorDetail ?? 'Optional worker coordination is healthy.'}</LumenText>
            </div>
            <div {...stylex.props(styles.actions)}>
              <StatusBadge tone={enrichment?.coordinatorState === 'ready' ? 'success' : 'warning'}>{enrichment?.coordinatorState ?? 'Unavailable'}</StatusBadge>
              <LumenButton isDisabled={enrichmentBusy} size="small" variant="quiet" onPress={() => void restartEnrichmentCoordinator()}>Retry</LumenButton>
            </div>
          </div>
        </SettingSection>
      ) : null}
      <SettingSection title="MCP services" description="Visible service and tool counts make unavailable states explicit.">
        {native ? nativeMcpCapabilities.map((capability) => (
          <div key={capability.id} {...stylex.props(styles.mcpRow)}>
            <McpIcon className={stylex.props(styles.mcpIcon).className} size={20} />
            <div {...stylex.props(styles.mcpText)}>
              <LumenText weight="medium">{capability.label}</LumenText>
              <LumenText tone="tertiary" variant="meta">{capability.description}</LumenText>
            </div>
            <StatusBadge tone="warning">{capability.badge}</StatusBadge>
          </div>
        )) : services.map((service) => (
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
        {native ? (
          <div {...stylex.props(styles.mcpRow)}>
            <McpIcon className={stylex.props(styles.mcpIcon).className} size={20} />
            <div {...stylex.props(styles.mcpText)}>
              <LumenText weight="medium">Native MCP tool permissions</LumenText>
              <LumenText tone="tertiary" variant="meta">No native MCP tool boundary is available, so there are no mutable tool permissions.</LumenText>
            </div>
            <StatusBadge tone="warning">Unavailable</StatusBadge>
          </div>
        ) : <ToolPermissionList permissions={permissions} onChange={setPermission} />}
      </SettingSection>
      <SettingSection title="Sanitized diagnostics">
        <div {...stylex.props(styles.mcpRow)}>
          <BugIcon aria-hidden="true" size={20} {...stylex.props(styles.mcpIcon)} />
          <div {...stylex.props(styles.mcpText)}>
            <LumenText weight="medium">Gateway support snapshot</LumenText>
            <LumenText tone="tertiary" variant="meta">Routes and states only. Secrets, prompts, and local paths are omitted.</LumenText>
          </div>
          {native ? <StatusBadge tone="info">Diagnostics page</StatusBadge> : <LumenButton size="small" variant="quiet"><PlugsConnectedIcon aria-hidden="true" size={15} /> Preview</LumenButton>}
        </div>
      </SettingSection>
    </SettingsPage>
  );
}
