import {LumenUiIcon} from '../../../design-system/icons/LumenUiIcon';
import {LumenButton} from '../../../design-system/primitives/LumenButton';
import {useDiagnosticsStore} from '../../diagnostics/diagnostics.store';
import {DiagnosticItem} from '../../diagnostics/DiagnosticItem';
import {SettingSection} from '../components/SettingSection';
import {SettingsCallout, SettingsPage} from '../components/SettingsPage';

export function DiagnosticsPage() {
  const snapshot = useDiagnosticsStore((state) => state.snapshot);
  const lastExport = useDiagnosticsStore((state) => state.lastExport);
  const refresh = useDiagnosticsStore((state) => state.refresh);
  const sampleRefreshRate = useDiagnosticsStore((state) => state.sampleRefreshRate);
  const prepareExport = useDiagnosticsStore((state) => state.prepareExport);

  return (
    <SettingsPage>
      <SettingsCallout>
        Values are sampled on demand. Lumen does not run a per-frame diagnostics render loop.
      </SettingsCallout>
      <SettingSection title="Runtime">
        <DiagnosticItem label="Application">Lumen {snapshot.appVersion}</DiagnosticItem>
        <DiagnosticItem label="WebView2">{snapshot.webViewVersion}</DiagnosticItem>
        <DiagnosticItem label="Tauri">{snapshot.tauriVersion}</DiagnosticItem>
        <DiagnosticItem label="Monitor">{snapshot.monitor}</DiagnosticItem>
        <DiagnosticItem label="DPI scale">{Math.round(snapshot.dpiScale * 100)}%</DiagnosticItem>
        <DiagnosticItem label="Refresh estimate">{snapshot.refreshRateHz} Hz</DiagnosticItem>
      </SettingSection>
      <SettingSection title="Rendering and activity">
        <DiagnosticItem label="Active animations">{snapshot.activeAnimations}</DiagnosticItem>
        <DiagnosticItem label="React commit">{snapshot.reactCommitMs.toFixed(2)} ms</DiagnosticItem>
        <DiagnosticItem label="Activity">{snapshot.activity}</DiagnosticItem>
        <DiagnosticItem label="AgentGateway">{snapshot.gateway}</DiagnosticItem>
        <DiagnosticItem label="Provider routes">{snapshot.providerRoutes.join('; ') || 'No routes'}</DiagnosticItem>
        <DiagnosticItem label="Logs">{snapshot.logs[snapshot.logs.length - 1] ?? 'No warnings recorded'}</DiagnosticItem>
      </SettingSection>
      <SettingSection title="Performance samples">
        <DiagnosticItem label="Browser long tasks (50 ms+)">{snapshot.browserLongTasks.length}</DiagnosticItem>
        <DiagnosticItem label="Interaction samples">{snapshot.timings.length}</DiagnosticItem>
      </SettingSection>
      <div style={{display: 'flex', flexWrap: 'wrap', gap: 8}}>
        <LumenButton aria-label="Refresh diagnostics" size="small" onPress={refresh}><LumenUiIcon name="refresh" size="small" /> Refresh</LumenButton>
        <LumenButton aria-label="Measure refresh rate" size="small" onPress={() => void sampleRefreshRate()}>Measure refresh rate</LumenButton>
        <LumenButton aria-label="Prepare diagnostics export" size="small" variant="quiet" onPress={prepareExport}><LumenUiIcon name="download" size="small" /> Prepare export</LumenButton>
      </div>
      {lastExport ? <SettingsCallout>{lastExport.filename} is prepared for review.</SettingsCallout> : null}
    </SettingsPage>
  );
}
