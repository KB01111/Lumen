import type {ReactNode} from 'react';

import * as stylex from '@stylexjs/stylex';
import {Tab, TabList} from 'react-aria-components';

import {LumenUiIcon} from '../../design-system/icons/LumenUiIcon';
import {tokens} from '../../design-system/tokens.stylex';
import type {SettingsPageId} from './settings.schema';

const styles = stylex.create({
  list: {
    display: 'grid',
    alignContent: 'start',
    gap: tokens.space2,
    padding: tokens.space5,
  },
  tab: {
    minHeight: tokens.controlHeightLarge,
    display: 'flex',
    alignItems: 'center',
    gap: tokens.space5,
    paddingInline: tokens.space6,
    color: tokens.colorTextSecondary,
    borderRadius: tokens.radiusMedium,
    cursor: 'default',
    outlineColor: 'transparent',
    outlineOffset: '-2px',
    outlineStyle: 'solid',
    outlineWidth: '2px',
    fontFamily: tokens.fontFamilyText,
    fontSize: tokens.fontSizeBody,
    fontWeight: tokens.fontWeightMedium,
    transitionDuration: tokens.durationHover,
    transitionProperty: 'background-color, color, box-shadow',
    transitionTimingFunction: tokens.easingStandard,
  },
  hovered: {backgroundColor: tokens.colorMaterialRaised, color: tokens.colorTextPrimary},
  selected: {
    color: tokens.colorTextPrimary,
    backgroundColor: tokens.colorSelection,
    boxShadow: `${tokens.shadowInsetTop}, inset 3px 0 0 ${tokens.colorAccent}`,
  },
  focused: {
    outlineColor: tokens.colorFocus,
    boxShadow: `0 0 0 3px ${tokens.colorFocusSoft}`,
  },
  icon: {display: 'grid', flexShrink: 0, color: 'currentColor'},
});

export interface SettingsPageDefinition {
  id: SettingsPageId;
  label: string;
  description: string;
  icon: ReactNode;
}

export const settingsPages: readonly SettingsPageDefinition[] = [
  {id: 'general', label: 'General', description: 'Startup, shortcut, and window behavior', icon: <LumenUiIcon className="size-[18px]" name="settings" />},
  {id: 'appearance', label: 'Appearance', description: 'Material, theme, density, and motion', icon: <LumenUiIcon className="size-[18px]" name="colorTheme" />},
  {id: 'indexed-roots', label: 'Indexed roots', description: 'Folders and exclusion policies', icon: <LumenUiIcon className="size-[18px]" name="folder" />},
  {id: 'search', label: 'Search', description: 'Scopes and ranking priorities', icon: <LumenUiIcon className="size-[18px]" name="search" />},
  {id: 'local-ai', label: 'Local AI', description: 'Hardware and model readiness', icon: <LumenUiIcon className="size-[18px]" name="hardware" />},
  {id: 'agent-gateway', label: 'AgentGateway', description: 'Providers, routes, MCP, and consent', icon: <LumenUiIcon className="size-[18px]" name="connect" />},
  {id: 'computer-use', label: 'Computer Use', description: 'Gemini browser agent, consent, and approvals', icon: <LumenUiIcon className="size-[18px]" name="computer" />},
  {id: 'activity', label: 'Activity', description: 'Indexing and quiet-mode policies', icon: <LumenUiIcon className="size-[18px]" name="speed" />},
  {id: 'privacy', label: 'Privacy', description: 'Local data and destructive actions', icon: <LumenUiIcon className="size-[18px]" name="privacy" />},
  {id: 'diagnostics', label: 'Diagnostics', description: 'Runtime status and performance evidence', icon: <LumenUiIcon className="size-[18px]" name="pulse" />},
];

export function SettingsNav() {
  return (
    <nav aria-label="Settings">
      <TabList aria-label="Settings pages" items={settingsPages} {...stylex.props(styles.list)}>
        {(page) => (
          <Tab
            id={page.id}
            className={({isFocusVisible, isHovered, isSelected}) => stylex.props(
              styles.tab,
              isHovered && styles.hovered,
              isSelected && styles.selected,
              isFocusVisible && styles.focused,
            ).className ?? ''}
          >
            <span aria-hidden="true" {...stylex.props(styles.icon)}>{page.icon}</span>
            {page.label}
          </Tab>
        )}
      </TabList>
    </nav>
  );
}
