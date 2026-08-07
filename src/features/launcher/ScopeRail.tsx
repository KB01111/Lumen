import {Tab, TabList, TabPanel, Tabs} from 'react-aria-components';

import {motion} from 'motion/react';

import {useLumenMotion} from '../../design-system/MotionProvider';
import {cn} from '../../lib/cn';
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

export function ScopeRail() {
  const {layoutTransition} = useLumenMotion();
  const activeScope = useScopeStore((state) => state.activeScope);
  const setScope = useScopeStore((state) => state.setScope);

  return (
    <Tabs
      className="min-w-0 border-t border-[color:var(--einui-command-divider)]"
      selectedKey={activeScope}
      onSelectionChange={(key) => setScope(key as SearchScope)}
    >
      <TabList aria-label="Search scopes" className="flex items-center gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none]" items={searchScopes}>
        {(scope) => (
          <Tab
            id={scope.id}
            className={({isFocusVisible, isHovered, isSelected}) =>
              cn(
                'relative shrink-0 cursor-default rounded-[var(--lumen-radius-control)] bg-transparent px-3 py-2 font-sans text-sm font-medium text-[color:var(--einui-command-muted-text)] outline-2 outline-offset-1 outline-transparent transition-[background-color,color,outline-color] duration-[120ms] ease-standard',
                isHovered && 'bg-[var(--einui-command-row-hover)] text-[color:var(--einui-command-text)]',
                isSelected && 'text-[color:var(--einui-command-text)]',
                isFocusVisible && 'outline-[color:var(--lumen-focus)]',
              )
            }
          >
            {({isSelected}) => (
              <>
                {isSelected ? (
                  <motion.span
                    aria-hidden="true"
                    layoutId="lumen-scope-indicator"
                    transition={layoutTransition}
                    className="absolute inset-0 z-0 rounded-[var(--lumen-radius-control)] border border-[color:var(--einui-command-divider)] bg-[var(--einui-command-row-selected)] shadow-[var(--lumen-shadow-control)]"
                  />
                ) : null}
                <span className="relative z-10">{scope.label}</span>
              </>
            )}
          </Tab>
        )}
      </TabList>
      {searchScopes.map((scope) => (
        <TabPanel key={scope.id} className="hidden" id={scope.id} />
      ))}
    </Tabs>
  );
}
