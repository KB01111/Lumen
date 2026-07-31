import {useEffect, useRef, type ReactNode} from 'react';

import {XIcon} from '@phosphor-icons/react';
import * as stylex from '@stylexjs/stylex';
import {AnimatePresence, motion} from 'motion/react';
import {TabPanel, Tabs} from 'react-aria-components';

import {useLumenMotion} from '../../design-system/MotionProvider';
import {LumenIconButton} from '../../design-system/primitives/LumenIconButton';
import {LumenSurface} from '../../design-system/primitives/LumenSurface';
import {LumenText} from '../../design-system/primitives/LumenText';
import {tokens} from '../../design-system/tokens.stylex';
import {settingsPages, SettingsNav} from './SettingsNav';
import {settingsPageIdSchema, type SettingsPageId} from './settings.schema';
import {useSettingsStore} from './settings.store';

const styles = stylex.create({
  shell: {
    width: '100%',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
    display: 'grid',
    gridTemplateRows: '54px minmax(0, 1fr)',
    overflow: 'hidden',
    borderRadius: tokens.radiusLarge,
  },
  titlebar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.space8,
    paddingInline: tokens.space8,
    borderBottomColor: tokens.colorBorderSubtle,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
  },
  titleGroup: {display: 'flex', alignItems: 'baseline', gap: tokens.space5},
  tabs: {
    minWidth: 0,
    minHeight: 0,
    display: 'grid',
    gridTemplateColumns: 'minmax(176px, 224px) minmax(0, 1fr)',
  },
  rail: {
    minWidth: 0,
    minHeight: 0,
    overflowY: 'auto',
    backgroundColor: tokens.colorMaterialInset,
    borderRightColor: tokens.colorBorderSubtle,
    borderRightStyle: 'solid',
    borderRightWidth: '1px',
  },
  panel: {
    minWidth: 0,
    minHeight: 0,
    outline: 'none',
  },
  page: {
    width: '100%',
    maxWidth: '760px',
    display: 'grid',
    alignContent: 'start',
    gap: tokens.space12,
    marginInline: 'auto',
    paddingBlock: tokens.space12,
    paddingInline: tokens.space12,
  },
  heading: {display: 'grid', gap: tokens.space3},
  overview: {
    padding: tokens.space10,
    backgroundColor: tokens.colorMaterialInset,
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusLarge,
  },
});

export interface SettingsShellProps {
  onClose(): void;
  pages?: Partial<Record<SettingsPageId, ReactNode>>;
}

export function SettingsShell({onClose, pages}: SettingsShellProps) {
  const {opacityDuration, reducedMotion} = useLumenMotion();
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
      className={stylex.props(styles.shell).className}
      material="mica"
    >
      <header data-tauri-drag-region {...stylex.props(styles.titlebar)}>
        <div {...stylex.props(styles.titleGroup)}>
          <LumenText weight="semibold">Lumen</LumenText>
          <LumenText tone="tertiary" variant="meta">Settings</LumenText>
        </div>
        <LumenIconButton aria-label="Close settings" size="small" variant="quiet" onPress={onClose}>
          <XIcon aria-hidden="true" size={16} />
        </LumenIconButton>
      </header>
      <Tabs
        orientation="vertical"
        selectedKey={activePage}
        onSelectionChange={handleSelectionChange}
        {...stylex.props(styles.tabs)}
      >
        <div {...stylex.props(styles.rail)}><SettingsNav /></div>
        <TabPanel
          key={activePage}
          id={activePage}
          data-testid="settings-content"
          style={{overflowY: 'auto'}}
          {...stylex.props(styles.panel)}
        >
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={activePage}
              {...stylex.props(styles.page)}
              initial={{opacity: 0, x: reducedMotion ? 0 : 10}}
              animate={{opacity: 1, x: 0}}
              exit={{opacity: 0, x: reducedMotion ? 0 : -8}}
              transition={{duration: opacityDuration}}
            >
              <div {...stylex.props(styles.heading)}>
                <LumenText as="h1" variant="title">{page.label}</LumenText>
                <LumenText tone="secondary">{page.description}</LumenText>
              </div>
              {pages?.[activePage] ?? (
                <div {...stylex.props(styles.overview)}>
                  <LumenText tone="secondary">
                    Lumen keeps this area focused on the controls that belong to {page.label.toLowerCase()}.
                  </LumenText>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </TabPanel>
      </Tabs>
    </LumenSurface>
  );
}
