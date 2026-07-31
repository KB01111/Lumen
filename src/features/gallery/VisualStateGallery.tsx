import {useCallback, useEffect, useLayoutEffect, useMemo, useState} from 'react';

import * as stylex from '@stylexjs/stylex';

import {LumenSurface} from '../../design-system/primitives/LumenSurface';
import {LumenText} from '../../design-system/primitives/LumenText';
import {tokens} from '../../design-system/tokens.stylex';
import {createWindowService} from '../../platform/window/tauri-window-service';
import type {WindowService} from '../../platform/window/window-service';
import {ActivityStatus} from '../activity/ActivityStatus';
import {GatewayStatusPanel} from '../gateway/GatewayStatusPanel';
import {CollapsedLauncher} from '../launcher/CollapsedLauncher';
import {ExpandedWorkspace} from '../launcher/ExpandedWorkspace';
import {useLauncherStore} from '../launcher/launcher.store';
import {useQueryStore} from '../launcher/query.store';
import {OnboardingFlow} from '../onboarding/OnboardingFlow';
import {useOnboardingStore} from '../onboarding/onboarding.store';
import type {RootSelectionService} from '../onboarding/root-selection-service';
import {SettingsShell} from '../settings/SettingsShell';
import {LocalAiPage} from '../settings/pages/LocalAiPage';
import {SearchPage} from '../settings/pages/SearchPage';
import {useSettingsStore} from '../settings/settings.store';
import {GallerySearchService, galleryResults} from './fixtures';
import {ScenarioControls} from './ScenarioControls';
import {galleryScenarios, getGalleryScenario} from './scenarios';
import type {GalleryLauncherState, GalleryScenario, GalleryScenarioId} from './gallery.types';

const styles = stylex.create({
  gallery: {
    width: '100%',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
    display: 'grid',
    gridTemplateRows: 'auto minmax(0, 1fr)',
    overflow: 'hidden',
    backgroundColor: tokens.colorCanvas,
  },
  capture: {gridTemplateRows: 'minmax(0, 1fr)', backgroundColor: 'transparent'},
  workspace: {
    minWidth: 0,
    minHeight: 0,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: tokens.space8,
    padding: tokens.space8,
    overflow: 'hidden',
  },
  matrixWorkspace: {gridTemplateColumns: '300px minmax(0, 1fr)'},
  matrix: {
    minWidth: 0,
    minHeight: 0,
    display: 'grid',
    alignContent: 'start',
    gap: tokens.space3,
    padding: tokens.space6,
    overflowY: 'auto',
    backgroundColor: tokens.colorCanvasElevated,
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusLarge,
  },
  matrixItem: {
    width: '100%',
    minHeight: tokens.controlHeightMedium,
    display: 'grid',
    gap: tokens.space1,
    paddingBlock: tokens.space4,
    paddingInline: tokens.space5,
    color: tokens.colorTextSecondary,
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusMedium,
    textAlign: 'left',
    fontFamily: tokens.fontFamilyText,
    cursor: 'default',
  },
  matrixSelected: {color: tokens.colorTextPrimary, backgroundColor: tokens.colorSelection, borderColor: tokens.colorBorderStrong},
  surfaceFrame: {
    minWidth: 0,
    minHeight: 0,
    display: 'grid',
    placeItems: 'center',
    overflow: 'hidden',
  },
  productSurface: {
    width: 'min(100%, 880px)',
    height: 'min(100%, 600px)',
    minWidth: 0,
    minHeight: 0,
  },
  launcherSurface: {width: 'min(100%, 800px)', height: 'min(100%, 540px)'},
  collapsedSurface: {height: '66px'},
  panel: {
    width: 'min(100%, 760px)',
    maxHeight: 'min(100%, 620px)',
    display: 'grid',
    alignContent: 'start',
    gap: tokens.space10,
    padding: tokens.space12,
    overflowY: 'auto',
    borderRadius: tokens.radiusLarge,
  },
  pageHeading: {display: 'grid', gap: tokens.space3},
});

const galleryWindowService: WindowService = {
  async show() {},
  async hide() {},
  async focusInput() {},
  async setShortcut() {},
};
const nativeGalleryWindowService = createWindowService();

const galleryRootService: RootSelectionService = {async chooseRoot() { return null; }};
const textScales = [100, 125, 150, 175, 200] as const;
const themes = ['dark', 'light', 'opaque', 'high-contrast', 'reduced-motion'] as const;

function navigate(parameters: URLSearchParams) {
  window.location.search = parameters.toString();
}

function GalleryLauncher({state}: {state: GalleryLauncherState}) {
  const results = useMemo(() => galleryResults(state.resultSet), [state.resultSet]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const service = useMemo(
    () => new GallerySearchService(results, state.preview ?? 'complete'),
    [results, state.preview],
  );

  useLayoutEffect(() => {
    const query = useQueryStore.getState();
    query.reset();
    if (state.composing) {
      query.startComposition();
    }
    query.setDraft(state.query);
    useLauncherStore.getState().show(state.mode);
    const index = state.selectedIndex ?? (results.length > 0 ? 0 : -1);
    setSelectedId(index >= 0 ? results[index]?.id ?? null : null);
  }, [results, state]);

  const noRootError = state.noRoot
    ? {code: 'unavailable' as const, message: 'Choose an indexed root to search local filenames.', recoverable: true}
    : null;
  const lifecycle = state.noRoot ? 'error' : results.length > 0 ? 'ready' : 'empty';
  const expanded = state.mode === 'expanded';

  return (
    <div {...stylex.props(
      styles.productSurface,
      styles.launcherSurface,
      !expanded && styles.collapsedSurface,
    )}>
      <CollapsedLauncher
        statusLabel={state.noRoot ? 'No root' : results.length > 0 ? `${results.length} results` : 'Ready'}
        windowService={galleryWindowService}
        expandedContent={expanded ? (
          <ExpandedWorkspace
            activeFilters={[]}
            announcement={noRootError?.message ?? `${results.length} deterministic results`}
            error={noRootError}
            lifecycle={lifecycle}
            openingId={null}
            results={results}
            selectedId={selectedId}
            service={service}
            onClearFilters={() => undefined}
            onDetails={() => undefined}
            onOpen={() => undefined}
            onOpenContainingFolder={() => undefined}
            onRemoveFilter={() => undefined}
            onSelectionChange={setSelectedId}
          />
        ) : null}
      />
    </div>
  );
}

function GalleryPanel({scenario, children}: {scenario: GalleryScenario; children: React.ReactNode}) {
  return (
    <LumenSurface aria-label={scenario.label} className={stylex.props(styles.panel).className} material="mica">
      <div {...stylex.props(styles.pageHeading)}>
        <LumenText as="h1" variant="title">{scenario.label}</LumenText>
        <LumenText tone="secondary">{scenario.description}</LumenText>
      </div>
      {children}
    </LumenSurface>
  );
}

function GallerySettingsShell({page}: {page: 'general' | 'agent-gateway'}) {
  useLayoutEffect(() => {
    useSettingsStore.setState({activePage: page, hydrated: true, persistenceStatus: 'ready'});
  }, [page]);
  return <div {...stylex.props(styles.productSurface)}><SettingsShell onClose={() => undefined} /></div>;
}

function GalleryOnboarding({step}: {step: number}) {
  useLayoutEffect(() => {
    useOnboardingStore.setState({
      completed: false,
      currentIndex: step,
      hydrated: true,
      root: '',
      shortcut: 'Alt + Space',
      started: step > 0,
    });
  }, [step]);
  return (
    <div {...stylex.props(styles.productSurface)}>
      <OnboardingFlow rootService={galleryRootService} windowService={galleryWindowService} />
    </div>
  );
}

function ScenarioSurface({scenario}: {scenario: GalleryScenario}) {
  const surface = scenario.surface;
  switch (surface.kind) {
    case 'launcher': return <GalleryLauncher key={scenario.id} state={surface.state} />;
    case 'activity': return <GalleryPanel scenario={scenario}><ActivityStatus mode={surface.mode} /></GalleryPanel>;
    case 'local-ai': return <GalleryPanel scenario={scenario}><LocalAiPage model={{hardware: surface.hardware, state: surface.model, progress: surface.progress}} /></GalleryPanel>;
    case 'gateway': return <GalleryPanel scenario={scenario}><GatewayStatusPanel state={surface.state} onRestart={() => undefined} /></GalleryPanel>;
    case 'settings-page': return <GalleryPanel scenario={scenario}><SearchPage /></GalleryPanel>;
    case 'settings-shell': return <GallerySettingsShell page={surface.page === 'agent-gateway' ? 'agent-gateway' : 'general'} />;
    case 'onboarding': return <GalleryOnboarding step={surface.step} />;
  }
}

export function VisualStateGallery() {
  const parameters = useMemo(() => new URLSearchParams(window.location.search), []);
  const scenario = getGalleryScenario(parameters.get('scenario'));
  const matrix = parameters.get('matrix') === '1';
  const capture = parameters.get('capture') === '1';
  const parsedScale = Number(parameters.get('scale') ?? '100');
  const scale = textScales.includes(parsedScale as (typeof textScales)[number]) ? parsedScale : 100;

  useEffect(() => {
    void nativeGalleryWindowService.show('gallery');
  }, []);

  useEffect(() => {
    const original = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = `${16 * scale / 100}px`;
    return () => { document.documentElement.style.fontSize = original; };
  }, [scale]);

  const setParameter = useCallback((name: string, value: string | null) => {
    const next = new URLSearchParams(window.location.search);
    if (value === null) next.delete(name);
    else next.set(name, value);
    next.set('gallery', '1');
    navigate(next);
  }, []);

  const navigateScenario = useCallback((direction: -1 | 1) => {
    const index = galleryScenarios.findIndex((item) => item.id === scenario.id);
    const next = galleryScenarios[(index + direction + galleryScenarios.length) % galleryScenarios.length];
    if (next) setParameter('scenario', next.id);
  }, [scenario.id, setParameter]);

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, select, textarea')) return;
      if (event.key === '[') navigateScenario(-1);
      else if (event.key === ']') navigateScenario(1);
      else if (event.key.toLowerCase() === 'm') setParameter('matrix', matrix ? null : '1');
      else if (event.key.toLowerCase() === 'd') {
        const index = textScales.indexOf(scale as (typeof textScales)[number]);
        setParameter('scale', String(textScales[(index + 1) % textScales.length]));
      } else if (event.key.toLowerCase() === 't') {
        const current = parameters.get('theme') as (typeof themes)[number] | null;
        const index = current ? themes.indexOf(current) : -1;
        setParameter('theme', themes[(index + 1) % themes.length]);
      }
    };
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [matrix, navigateScenario, parameters, scale, setParameter]);

  return (
    <section
      aria-label="Lumen visual state gallery"
      data-gallery-scenario={scenario.id}
      {...stylex.props(styles.gallery, capture && styles.capture)}
    >
      {!capture ? (
        <ScenarioControls
          matrix={matrix}
          scale={scale}
          scenarioId={scenario.id}
          onMatrix={() => setParameter('matrix', matrix ? null : '1')}
          onNavigate={navigateScenario}
          onScenario={(id: GalleryScenarioId) => setParameter('scenario', id)}
        />
      ) : null}
      <div {...stylex.props(styles.workspace, matrix && styles.matrixWorkspace)}>
        {matrix ? (
          <nav aria-label="Scenario matrix" {...stylex.props(styles.matrix)}>
            {galleryScenarios.map((item) => (
              <button
                key={item.id}
                aria-current={item.id === scenario.id ? 'true' : undefined}
                {...stylex.props(styles.matrixItem, item.id === scenario.id && styles.matrixSelected)}
                onClick={() => setParameter('scenario', item.id)}
              >
                <LumenText weight="medium">{item.label}</LumenText>
                <LumenText tone="tertiary" variant="caption">{item.category}</LumenText>
              </button>
            ))}
          </nav>
        ) : null}
        <div {...stylex.props(styles.surfaceFrame)}><ScenarioSurface scenario={scenario} /></div>
      </div>
    </section>
  );
}
