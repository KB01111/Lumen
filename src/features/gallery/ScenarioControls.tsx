import {LumenUiIcon} from '../../design-system/icons/LumenUiIcon';
import {LumenButton} from '../../design-system/primitives/LumenButton';
import {LumenText} from '../../design-system/primitives/LumenText';
import {galleryScenarios} from './scenarios';
import type {GalleryScenarioId} from './gallery.types';

export interface ScenarioControlsProps {
  matrix: boolean;
  scale: number;
  scenarioId: GalleryScenarioId;
  onMatrix(): void;
  onNavigate(direction: -1 | 1): void;
  onScenario(id: GalleryScenarioId): void;
}

export function ScenarioControls({matrix, scale, scenarioId, onMatrix, onNavigate, onScenario}: ScenarioControlsProps) {
  return (
    <header aria-label="Gallery controls" className="grid min-w-0 grid-cols-[auto_minmax(220px,1fr)_auto_auto] items-center gap-3 border-b border-border-subtle bg-surface-raised p-3 text-text-primary">
      <div className="flex gap-1.5">
        <LumenButton aria-label="Previous scenario" size="small" variant="quiet" onPress={() => onNavigate(-1)}>
          <LumenUiIcon name="previous" size="small" />
        </LumenButton>
        <LumenButton aria-label="Next scenario" size="small" variant="quiet" onPress={() => onNavigate(1)}>
          <LumenUiIcon name="next" size="small" />
        </LumenButton>
      </div>
      <select
        aria-label="Gallery scenario"
        value={scenarioId}
        className="min-h-9 w-full rounded-control border border-border-strong bg-surface-raised px-3 font-sans text-sm text-text-primary"
        onChange={(event) => onScenario(event.target.value as GalleryScenarioId)}
      >
        {galleryScenarios.map((scenario) => (
          <option key={scenario.id} value={scenario.id}>{scenario.label}</option>
        ))}
      </select>
      <LumenButton aria-label="Toggle scenario matrix" size="small" variant={matrix ? 'primary' : 'quiet'} onPress={onMatrix}>
        <LumenUiIcon name="grid" size="small" /> Matrix
      </LumenButton>
      <LumenText className="whitespace-nowrap" tone="tertiary" variant="caption">
        {scale}% · [ ] scenario · T theme · D scale
      </LumenText>
    </header>
  );
}
