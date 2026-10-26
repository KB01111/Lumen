import {memo, useContext, useEffect, useMemo, useState} from 'react';
import {Tab, TabList, TabPanel, Tabs} from 'react-aria-components';

import {motion} from 'motion/react';

import {useLumenMotion} from '../../design-system/MotionProvider';
import {cn} from '../../lib/cn';
import type {SearchScope} from '../../services/search/search.types';
import {SemanticSearchContext} from './semantic-search-context';
import {useSettingsStore} from '../settings/settings.store';
import {useWindowsAiStore} from '../windows-ai/windows-ai.store';
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
  {id: 'app-content', label: 'App content'},
];

export const ScopeRail = memo(function ScopeRail() {
  const semanticSearchService = useContext(SemanticSearchContext);
  const {layoutTransition} = useLumenMotion();
  const activeScope = useScopeStore((state) => state.activeScope);
  const setScope = useScopeStore((state) => state.setScope);
  const enabledScopeIds = useSettingsStore((state) => state.search.enabledScopes);
  const historyEnabled = useSettingsStore((state) => state.general.historyEnabled);
  const appContentEnabled = useWindowsAiStore((state) => state.snapshot?.preferences.appContentEnabled === true);
  const [relatedAvailable, setRelatedAvailable] = useState(false);
  useEffect(() => {
    let current = true;
    void semanticSearchService.status()
      .then((status) => { if (current) setRelatedAvailable(status.relatedAvailable); })
      .catch(() => { if (current) setRelatedAvailable(false); });
    return () => { current = false; };
  }, [semanticSearchService]);
  const enabledScopes = useMemo(
    () => searchScopes.filter((scope) =>
      (scope.id === 'app-content' ? appContentEnabled : enabledScopeIds.includes(scope.id)) &&
      (scope.id !== 'recent' || historyEnabled) &&
      (scope.id !== 'related' || relatedAvailable)),
    [appContentEnabled, enabledScopeIds, historyEnabled, relatedAvailable],
  );

  useEffect(() => {
    if (!enabledScopes.some((scope) => scope.id === activeScope)) {
      setScope(enabledScopes[0]?.id ?? 'all');
    }
  }, [activeScope, enabledScopes, setScope]);

  return (
    <Tabs
      className="min-w-0"
      selectedKey={activeScope}
      onSelectionChange={(key) => setScope(key as SearchScope)}
    >
      <TabList aria-label="Search scopes" className="flex items-center gap-[2px] overflow-x-auto px-[12px] pt-[2px] pb-[8px] [scrollbar-width:none]" items={enabledScopes}>
        {(scope) => (
          <Tab
            id={scope.id}
            className={({isFocusVisible, isHovered, isSelected}) =>
              cn(
                'relative min-h-[32px] shrink-0 cursor-default rounded-pill bg-transparent px-[12px] py-[4px] font-sans text-[0.8125rem] font-medium text-[color:var(--einui-command-muted-text)] outline-2 outline-offset-1 outline-transparent transition-[background-color,color,outline-color] duration-[var(--lumen-duration-selection)] ease-standard',
                isHovered && 'bg-[var(--einui-command-row-hover)] text-[color:var(--einui-command-text)] high-contrast:text-[HighlightText]',
                isSelected && 'text-[color:var(--einui-command-text)] high-contrast:text-[HighlightText]',
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
                    className="absolute inset-0 z-0 rounded-pill bg-[var(--einui-command-row-selected)] shadow-[inset_0_0_0_1px_var(--einui-command-row-selected-edge)]"
                  />
                ) : null}
                <span className="relative z-10">{scope.label}</span>
              </>
            )}
          </Tab>
        )}
      </TabList>
      {enabledScopes.map((scope) => (
        <TabPanel key={scope.id} className="hidden" id={scope.id} />
      ))}
    </Tabs>
  );
});
