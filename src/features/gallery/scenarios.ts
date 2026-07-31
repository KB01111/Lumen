import type {GalleryScenario, GalleryScenarioId} from './gallery.types';

const dark = {mode: 'dark', transparency: 'native', effects: 'full', motion: 'full'} as const;

export const galleryScenarios: readonly GalleryScenario[] = [
  {id: 'collapsed-idle', label: 'Collapsed · idle', description: 'Warm launcher before input.', category: 'Launcher', surface: {kind: 'launcher', state: {mode: 'collapsed', query: ''}}},
  {id: 'collapsed-focused', label: 'Collapsed · focused', description: 'Search field with keyboard focus.', category: 'Launcher', surface: {kind: 'launcher', state: {mode: 'collapsed', query: ''}}},
  {id: 'collapsed-typing', label: 'Collapsed · composing', description: 'IME-safe draft before commit.', category: 'Launcher', surface: {kind: 'launcher', state: {mode: 'collapsed', query: 'års', composing: true}}},
  {id: 'expanded-results', label: 'Expanded results', description: 'Production launcher geometry with local files.', category: 'Launcher', surface: {kind: 'launcher', state: {mode: 'expanded', query: 'report', resultSet: 'standard'}}},
  {id: 'grouped-results', label: 'Grouped results', description: 'Local result group with mixed file kinds.', category: 'Launcher', surface: {kind: 'launcher', state: {mode: 'expanded', query: 'lumen', resultSet: 'standard'}}},
  {id: 'selected-result', label: 'Selected result', description: 'Keyboard selection capsule and actions.', category: 'Launcher', surface: {kind: 'launcher', state: {mode: 'expanded', query: 'report', resultSet: 'standard', selectedIndex: 1}}},
  {id: 'preview-loading', label: 'Preview · loading', description: 'Cancellable preview request in progress.', category: 'Preview', surface: {kind: 'launcher', state: {mode: 'expanded', query: 'report', resultSet: 'standard', selectedIndex: 0, preview: 'loading'}}},
  {id: 'preview-complete', label: 'Preview · complete', description: 'Safe Markdown preview and metadata.', category: 'Preview', surface: {kind: 'launcher', state: {mode: 'expanded', query: 'report', resultSet: 'standard', selectedIndex: 1, preview: 'complete'}}},
  {id: 'preview-failed', label: 'Preview · failed', description: 'Recoverable passive preview error.', category: 'Preview', surface: {kind: 'launcher', state: {mode: 'expanded', query: 'report', resultSet: 'standard', selectedIndex: 0, preview: 'failed'}}},
  {id: 'empty-results', label: 'Empty results', description: 'Valid root with no filename matches.', category: 'Launcher', surface: {kind: 'launcher', state: {mode: 'expanded', query: 'nothing-here', resultSet: 'empty'}}},
  {id: 'no-indexed-root', label: 'No indexed root', description: 'Honest setup state without fixture results.', category: 'Launcher', surface: {kind: 'launcher', state: {mode: 'expanded', query: 'report', resultSet: 'empty', noRoot: true}}},
  ...(['indexing', 'slow', 'gaming', 'fullscreen', 'cinema', 'idle', 'battery', 'user'] as const).map((mode) => ({
    id: `activity-${mode}` as GalleryScenarioId,
    label: `Activity · ${mode}`,
    description: 'Deterministic background activity policy state.',
    category: 'Activity' as const,
    surface: {kind: 'activity' as const, mode},
  })),
  ...(['npu', 'gpu', 'cpu', 'unavailable'] as const).map((hardware) => ({
    id: `provider-${hardware}` as GalleryScenarioId,
    label: `Provider · ${hardware.toUpperCase()}`,
    description: 'Local hardware capability presentation.',
    category: 'Local AI' as const,
    surface: {kind: 'local-ai' as const, hardware, model: hardware === 'unavailable' ? 'missing' as const : 'ready' as const},
  })),
  ...(['missing', 'downloading', 'loading', 'ready', 'failed', 'fallback-active'] as const).map((model) => ({
    id: `model-${model}` as GalleryScenarioId,
    label: `Model · ${model}`,
    description: 'Deterministic local model lifecycle.',
    category: 'Local AI' as const,
    surface: {kind: 'local-ai' as const, hardware: 'gpu' as const, model, progress: model === 'downloading' ? 42 : undefined},
  })),
  ...(['starting', 'ready', 'unavailable', 'restarting'] as const).map((state) => ({
    id: `gateway-${state}` as GalleryScenarioId,
    label: `Gateway · ${state}`,
    description: 'AgentGateway lifecycle without a production sidecar.',
    category: 'Gateway' as const,
    surface: {kind: 'gateway' as const, state},
  })),
  {id: 'reranking-unavailable', label: 'Reranking unavailable', description: 'Phase-one semantic controls remain explicitly unavailable.', category: 'Resilience', surface: {kind: 'settings-page', page: 'search'}},
  {id: 'permission-required', label: 'Permission required', description: 'Disabled result communicates required access.', category: 'Resilience', surface: {kind: 'launcher', state: {mode: 'expanded', query: 'private', resultSet: 'permission'}}},
  {id: 'long-filename', label: 'Long filename', description: 'Extreme filename truncates without moving actions.', category: 'Resilience', surface: {kind: 'launcher', state: {mode: 'expanded', query: 'architecture', resultSet: 'long'}}},
  {id: 'unicode-filename', label: 'Unicode filename', description: 'Swedish, Japanese, Arabic, emoji, and combining text.', category: 'Resilience', surface: {kind: 'launcher', state: {mode: 'expanded', query: 'rapport', resultSet: 'unicode'}}},
  {id: 'large-results', label: '10,000 results', description: 'Virtualized large deterministic result set.', category: 'Resilience', surface: {kind: 'launcher', state: {mode: 'expanded', query: 'large-set', resultSet: 'large', selectedIndex: 0}}},
  {id: 'theme-light', label: 'Theme · light', description: 'Translucent light material.', category: 'Theme', appearance: {...dark, mode: 'light'}, surface: {kind: 'launcher', state: {mode: 'expanded', query: 'report', resultSet: 'standard'}}},
  {id: 'theme-dark', label: 'Theme · dark', description: 'Translucent dark material.', category: 'Theme', appearance: dark, surface: {kind: 'launcher', state: {mode: 'expanded', query: 'report', resultSet: 'standard'}}},
  {id: 'theme-opaque', label: 'Theme · opaque', description: 'Wallpaper-independent dark surface.', category: 'Theme', appearance: {...dark, transparency: 'disabled', effects: 'reduced'}, surface: {kind: 'launcher', state: {mode: 'expanded', query: 'report', resultSet: 'standard'}}},
  {id: 'theme-high-contrast', label: 'Theme · high contrast', description: 'Forced-color token contract.', category: 'Theme', appearance: dark, forceHighContrast: true, surface: {kind: 'launcher', state: {mode: 'expanded', query: 'report', resultSet: 'standard'}}},
  {id: 'theme-reduced-motion', label: 'Theme · reduced motion', description: 'Spatial motion replaced with near-instant fades.', category: 'Theme', appearance: {...dark, motion: 'reduced'}, surface: {kind: 'launcher', state: {mode: 'expanded', query: 'report', resultSet: 'standard'}}},
  {id: 'settings-general', label: 'Settings · General', description: 'Full settings shell and fixed navigation rail.', category: 'Management', surface: {kind: 'settings-shell', page: 'general'}},
  {id: 'settings-agent-gateway', label: 'Settings · AgentGateway', description: 'Routes, permissions, consent, and diagnostics.', category: 'Management', surface: {kind: 'settings-shell', page: 'agent-gateway'}},
  {id: 'onboarding-welcome', label: 'Onboarding · welcome', description: 'First of eight concise first-run scenes.', category: 'Management', surface: {kind: 'onboarding', step: 0}},
];

export const galleryScenarioById = new Map(galleryScenarios.map((scenario) => [scenario.id, scenario]));

export function getGalleryScenario(id: string | null | undefined) {
  return galleryScenarioById.get(id as GalleryScenarioId) ?? galleryScenarios[0];
}
