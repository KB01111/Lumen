import {memo, useContext, useEffect, useMemo, useState} from 'react';
import {Tab, TabList} from '@fluentui/react-components';
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
    <TabList
      aria-label="Search scopes"
      className="lumen-fluent-scopes min-w-0 border-t border-[color:var(--einui-command-divider)]"
      selectedValue={activeScope}
      selectTabOnFocus
      size="small"
      onTabSelect={(_event, data) => setScope(data.value as SearchScope)}
    >
      {enabledScopes.map((scope) => (
        <Tab key={scope.id} data-selected={activeScope === scope.id || undefined} value={scope.id}>
          {scope.label}
        </Tab>
      ))}
    </TabList>
  );
});
