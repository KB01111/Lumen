import {Component, lazy, Suspense, type PropsWithChildren} from 'react';

import {LumenButton} from '../../design-system/primitives/LumenButton';
import {LumenText} from '../../design-system/primitives/LumenText';
import type {SettingsPageId} from './settings.schema';

const pages = {
  general: lazy(async () => ({default: (await import('./pages/GeneralPage')).GeneralPage})),
  appearance: lazy(async () => ({default: (await import('./pages/AppearancePage')).AppearancePage})),
  'indexed-roots': lazy(async () => ({default: (await import('./pages/IndexedRootsPage')).IndexedRootsPage})),
  search: lazy(async () => ({default: (await import('./pages/SearchPage')).SearchPage})),
  'local-ai': lazy(async () => ({default: (await import('./pages/LocalAiPage')).LocalAiPage})),
  'agent-gateway': lazy(async () => ({default: (await import('./pages/AgentGatewayPage')).AgentGatewayPage})),
  providers: lazy(async () => ({default: (await import('./pages/ProvidersPage')).ProvidersPage})),
  'computer-use': lazy(async () => ({default: (await import('./pages/ComputerUsePage')).ComputerUsePage})),
  activity: lazy(async () => ({default: (await import('./pages/ActivityPage')).ActivityPage})),
  privacy: lazy(async () => ({default: (await import('./pages/PrivacyPage')).PrivacyPage})),
  diagnostics: lazy(async () => ({default: (await import('./pages/DiagnosticsPage')).DiagnosticsPage})),
};

class SettingsPageBoundary extends Component<PropsWithChildren, {failed: boolean}> {
  state = {failed: false};

  static getDerivedStateFromError() {
    return {failed: true};
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="grid min-w-0 justify-items-start gap-[12px] rounded-control border border-danger/40 bg-danger/10 p-[16px]" role="alert">
        <LumenText>This settings page could not load.</LumenText>
        <LumenText tone="secondary" variant="meta">You can open another page, or reload Lumen to try again. Your saved settings are kept.</LumenText>
        <LumenButton size="small" onPress={() => window.location.reload()}>Reload Lumen</LumenButton>
      </div>
    );
  }
}

export function SettingsPageContent({page}: {page: SettingsPageId}) {
  const Page = pages[page];
  return (
    <SettingsPageBoundary key={page}>
      <Suspense fallback={<LumenText role="status" tone="secondary">Loading settings…</LumenText>}>
        <Page />
      </Suspense>
    </SettingsPageBoundary>
  );
}
