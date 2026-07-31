import {Tab, TabList, TabPanel, Tabs} from 'react-aria-components';

import * as stylex from '@stylexjs/stylex';
import {motion} from 'motion/react';

import {useLumenMotion} from '../../design-system/MotionProvider';
import {tokens} from '../../design-system/tokens.stylex';
import type {SearchScope} from '../../services/search/search.types';
import {useScopeStore} from './scope.store';

export const searchScopes: ReadonlyArray<{id: SearchScope; label: string}> = [
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
  },
  indicator: {
    position: 'absolute',
    inset: 0,
    zIndex: tokens.zSelection,
    backgroundColor: tokens.colorSelectionStrong,
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusSmall,
    boxShadow: tokens.shadowInsetTop,
  },
  label: {
    position: 'relative',
    zIndex: tokens.zContent,
  },
  focused: {
    outlineColor: tokens.colorFocus,
  },
  panel: {
    display: 'none',
  },
});

export function ScopeRail() {
  const {layoutTransition} = useLumenMotion();
  const activeScope = useScopeStore((state) => state.activeScope);
  const setScope = useScopeStore((state) => state.setScope);

  return (
    <Tabs
      {...stylex.props(styles.root)}
      selectedKey={activeScope}
      onSelectionChange={(key) => setScope(key as SearchScope)}
    >
      <TabList aria-label="Search scopes" items={searchScopes} {...stylex.props(styles.list)}>
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
            {({isSelected}) => (
              <>
                {isSelected ? (
                  <motion.span
                    aria-hidden="true"
                    layoutId="lumen-scope-indicator"
                    transition={layoutTransition}
                    {...stylex.props(styles.indicator)}
                  />
                ) : null}
                <span {...stylex.props(styles.label)}>{scope.label}</span>
              </>
            )}
          </Tab>
        )}
      </TabList>
      {searchScopes.map((scope) => (
        <TabPanel key={scope.id} id={scope.id} {...stylex.props(styles.panel)} />
      ))}
    </Tabs>
  );
}
