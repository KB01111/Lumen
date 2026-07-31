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
  const cloudConsent = useGatewayStore((state) => state.cloudConsent);
  const actionMessage = useGatewayStore((state) => state.actionMessage);
  const restart = useGatewayStore((state) => state.restart);
  const setRouteProvider = useGatewayStore((state) => state.setRouteProvider);
  const setPermission = useGatewayStore((state) => state.setPermission);
  const grantCloudConsent = useGatewayStore((state) => state.grantCloudConsent);
  const testProvider = useGatewayStore((state) => state.testProvider);
  const testMcp = useGatewayStore((state) => state.testMcp);

  return (
    <SettingsPage>
      <GatewayStatusPanel state={gatewayState} onRestart={() => void restart()} />
      <SettingsCallout>
        AgentGateway actions below are deterministic previews. No sidecar, MCP server, or cloud request is started in phase one.
      </SettingsCallout>
      {actionMessage ? <SettingsCallout>{actionMessage}</SettingsCallout> : null}
      <SettingSection title="Virtual model routes" description="Aliases let future callers use a stable name while providers change underneath.">
        <ProviderRouteList routes={routes} onChange={setRouteProvider} onTest={(id) => void testProvider(id)} />
      </SettingSection>
      <SettingSection title="Cloud consent" description="Cloud routes stay unavailable until this device records explicit consent.">
        <div {...stylex.props(styles.mcpRow)}>
          <CloudCheckIcon aria-hidden="true" size={20} {...stylex.props(styles.mcpIcon)} />
          <div {...stylex.props(styles.mcpText)}>
            <LumenText weight="medium">Provider requests</LumenText>
            <LumenText tone="tertiary" variant="meta">Only sanitized prompts would leave this device after consent.</LumenText>
          </div>
          {cloudConsent ? (
            <StatusBadge tone="success">Cloud consent granted</StatusBadge>
          ) : (
            <ConfirmationDialog
              confirmLabel="Allow cloud requests"
              confirmVariant="primary"
              description="Future cloud providers may receive the text you explicitly send. Filenames, roots, and diagnostics remain excluded by default. No request is made in phase one."
              title="Allow cloud provider requests?"
              onConfirm={grantCloudConsent}
            >
              <LumenButton aria-label="Review cloud consent" size="small">Review consent</LumenButton>
            </ConfirmationDialog>
          )}
        </div>
      </SettingSection>
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
