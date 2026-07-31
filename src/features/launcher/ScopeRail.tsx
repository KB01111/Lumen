import {Tab, TabList, TabPanel, Tabs} from 'react-aria-components';

import * as stylex from '@stylexjs/stylex';

import {tokens} from '../../design-system/tokens.stylex';
import type {SearchScope} from '../../services/search/search.types';
import {useScopeStore} from './scope.store';

const scopes: ReadonlyArray<{id: SearchScope; label: string}> = [
  {id: 'all', label: 'All'},
  {id: 'files', label: 'Files'},
  {id: 'folders', label: 'Folders'},
  {id: 'documents', label: 'Documents'},
  {id: 'code', label: 'Code'},
  {id: 'images', label: 'Images'},
  {id: 'recent', label: 'Recent'},
  {id: 'related', label: 'Related'},
];

const styles = stylex.create({
  root: {
    minWidth: 0,
    borderTopColor: tokens.colorBorderSubtle,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
  },
  list: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.space2,
    paddingBlock: tokens.space4,
    paddingInline: tokens.space6,
    overflowX: 'auto',
    scrollbarWidth: 'none',
  },
  tab: {
    position: 'relative',
    flexShrink: 0,
    paddingBlock: tokens.space4,
    paddingInline: tokens.space6,
    color: tokens.colorTextTertiary,
    backgroundColor: 'transparent',
    borderRadius: tokens.radiusSmall,
    cursor: 'default',
    fontFamily: tokens.fontFamilyText,
    fontSize: tokens.fontSizeMeta,
    fontWeight: tokens.fontWeightMedium,
    outlineColor: 'transparent',
    outlineOffset: '1px',
    outlineStyle: 'solid',
    outlineWidth: '2px',
    transitionDuration: tokens.durationSelection,
    transitionProperty: 'background-color, color, outline-color',
    transitionTimingFunction: tokens.easingStandard,
  },
  hovered: {
    color: tokens.colorTextSecondary,
    backgroundColor: tokens.colorMaterialRaised,
  },
  selected: {
    color: tokens.colorTextPrimary,
    backgroundColor: tokens.colorSelectionStrong,
  },
  focused: {
    outlineColor: tokens.colorFocus,
  },
  panel: {
    display: 'none',
  },
});

export function ScopeRail() {
  const activeScope = useScopeStore((state) => state.activeScope);
  const setScope = useScopeStore((state) => state.setScope);

  return (
    <Tabs
      {...stylex.props(styles.root)}
      selectedKey={activeScope}
      onSelectionChange={(key) => setScope(key as SearchScope)}
    >
      <TabList aria-label="Search scopes" items={scopes} {...stylex.props(styles.list)}>
        {(scope) => (
          <Tab
            id={scope.id}
            className={({isFocusVisible, isHovered, isSelected}) =>
              stylex.props(
                styles.tab,
                isHovered && styles.hovered,
                isSelected && styles.selected,
                isFocusVisible && styles.focused,
              ).className ?? ''
            }
          >
            {scope.label}
          </Tab>
        )}
      </TabList>
      {scopes.map((scope) => (
        <TabPanel key={scope.id} id={scope.id} {...stylex.props(styles.panel)} />
      ))}
    </Tabs>
  );
}
