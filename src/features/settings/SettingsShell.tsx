import {useEffect, useRef, type ReactNode} from 'react';

import {AnimatePresence, motion} from 'motion/react';
import {TabPanel, Tabs} from 'react-aria-components';

import {useLumenMotion} from '../../design-system/MotionProvider';
import {LumenUiIcon} from '../../design-system/icons/LumenUiIcon';
import {LumenIconButton} from '../../design-system/primitives/LumenIconButton';
import {LumenSurface} from '../../design-system/primitives/LumenSurface';
import {LumenText} from '../../design-system/primitives/LumenText';
import {settingsPages, SettingsNav} from './SettingsNav';
import {PersistenceNotice} from './components/PersistenceNotice';
import {AppearancePage} from './pages/AppearancePage';
import {AgentGatewayPage} from './pages/AgentGatewayPage';
import {ActivityPage} from './pages/ActivityPage';
import {ComputerUsePage} from './pages/ComputerUsePage';
import {DiagnosticsPage} from './pages/DiagnosticsPage';
import {GeneralPage} from './pages/GeneralPage';
import {IndexedRootsPage} from './pages/IndexedRootsPage';
import {LocalAiPage} from './pages/LocalAiPage';
import {PrivacyPage} from './pages/PrivacyPage';
import {SearchPage} from './pages/SearchPage';
import {settingsPageIdSchema, type SettingsPageId} from './settings.schema';
import {useSettingsStore} from './settings.store';

export interface SettingsShellProps {
  onClose(): void;
  pages?: Partial<Record<SettingsPageId, ReactNode>>;
}

function defaultPageContent(page: SettingsPageId) {
  switch (page) {
    case 'general': return <GeneralPage />;
    case 'appearance': return <AppearancePage />;
    case 'indexed-roots': return <IndexedRootsPage />;
    case 'search': return <SearchPage />;
    case 'local-ai': return <LocalAiPage />;
    case 'agent-gateway': return <AgentGatewayPage />;
    case 'computer-use': return <ComputerUsePage />;
    case 'activity': return <ActivityPage />;
    case 'privacy': return <PrivacyPage />;
    case 'diagnostics': return <DiagnosticsPage />;
    default: return null;
  }
}

export function SettingsShell({onClose, pages}: SettingsShellProps) {
  const {pageDuration, reducedMotion} = useLumenMotion();
  const activePage = useSettingsStore((state) => state.activePage);
  const hydrate = useSettingsStore((state) => state.hydrate);
  const setActivePage = useSettingsStore((state) => state.setActivePage);
  const shellRef = useRef<HTMLDivElement>(null);
  const page = settingsPages.find((item) => item.id === activePage) ?? settingsPages[0];

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    shellRef.current?.querySelector<HTMLElement>('[role="tab"][data-selected="true"]')?.focus();
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleSelectionChange = (key: React.Key) => {
    const result = settingsPageIdSchema.safeParse(String(key));
    if (result.success) {
      setActivePage(result.data);
    }
  };

  return (
    <LumenSurface
      ref={shellRef}
      aria-label="Lumen settings"
      className="grid h-full min-h-0 min-w-0 w-full grid-rows-[54px_minmax(0,1fr)] overflow-hidden rounded-surface"
      material="mica"
    >
      <header data-tauri-drag-region className="flex items-center justify-between gap-6 border-b border-border-subtle px-6">
        <div className="flex items-baseline gap-3">
          <LumenText weight="semibold">Lumen</LumenText>
          <LumenText tone="tertiary" variant="meta">Settings</LumenText>
        </div>
        <LumenIconButton aria-label="Close settings" data-settings-close-action="true" size="small" variant="quiet" onPress={onClose}>
          <LumenUiIcon name="close" size="small" />
        </LumenIconButton>
      </header>
      <Tabs
        orientation="vertical"
        selectedKey={page.id}
        onSelectionChange={handleSelectionChange}
        className="grid min-h-0 min-w-0 grid-cols-[minmax(176px,260px)_minmax(0,1fr)]"
      >
        <div className="min-h-0 min-w-0 overflow-y-auto border-r border-border-subtle bg-surface-inset"><SettingsNav /></div>
        <main aria-label="Settings content" className="min-h-0 min-w-0 overflow-y-auto" data-testid="settings-content">
          <TabPanel key={page.id} id={page.id}>
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={page.id}
              className="mx-auto grid w-full max-w-[760px] content-start gap-8 px-8 py-8"
              initial={{opacity: 0, x: reducedMotion ? 0 : 10}}
              animate={{opacity: 1, x: 0}}
              exit={{opacity: 0, x: reducedMotion ? 0 : -8}}
              transition={{duration: pageDuration}}
            >
              <div className="grid gap-2">
                <LumenText as="h1" variant="title">{page.label}</LumenText>
                <LumenText tone="secondary">{page.description}</LumenText>
              </div>
              <PersistenceNotice />
              {pages?.[page.id] ?? defaultPageContent(page.id) ?? (
                <div className="rounded-surface border border-border-subtle bg-surface-inset p-6">
                  <LumenText tone="secondary">
                    Lumen keeps this area focused on the controls that belong to {page.label.toLowerCase()}.
                  </LumenText>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          </TabPanel>
        </main>
      </Tabs>
    </LumenSurface>
  );
}
