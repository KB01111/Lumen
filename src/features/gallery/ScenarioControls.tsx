import * as stylex from '@stylexjs/stylex';

import {LumenUiIcon} from '../../design-system/icons/LumenUiIcon';
import {LumenButton} from '../../design-system/primitives/LumenButton';
import {LumenText} from '../../design-system/primitives/LumenText';
import {tokens} from '../../design-system/tokens.stylex';
import {galleryScenarios} from './scenarios';
import type {GalleryScenarioId} from './gallery.types';

const styles = stylex.create({
  controls: {
    minWidth: 0,
    display: 'grid',
    gridTemplateColumns: 'auto minmax(220px, 1fr) auto auto',
    alignItems: 'center',
    gap: tokens.space6,
    padding: tokens.space6,
    color: tokens.colorTextPrimary,
    backgroundColor: tokens.colorCanvasElevated,
    borderBottomColor: tokens.colorBorderSubtle,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
  },
  arrows: {display: 'flex', gap: tokens.space3},
  select: {
    width: '100%',
    minHeight: tokens.controlHeightMedium,
    paddingInline: tokens.space6,
    color: tokens.colorTextPrimary,
    backgroundColor: tokens.colorMaterialRaised,
    borderColor: tokens.colorBorderStrong,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusMedium,
    fontFamily: tokens.fontFamilyText,
    fontSize: tokens.fontSizeBody,
  },
  hint: {whiteSpace: 'nowrap'},
});

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
    <header aria-label="Gallery controls" {...stylex.props(styles.controls)}>
      <div {...stylex.props(styles.arrows)}>
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
        {...stylex.props(styles.select)}
        onChange={(event) => onScenario(event.target.value as GalleryScenarioId)}
      >
        {galleryScenarios.map((scenario) => (
          <option key={scenario.id} value={scenario.id}>{scenario.label}</option>
        ))}
      </select>
      <LumenButton aria-label="Toggle scenario matrix" size="small" variant={matrix ? 'primary' : 'quiet'} onPress={onMatrix}>
        <LumenUiIcon name="grid" size="small" /> Matrix
      </LumenButton>
      <LumenText className={stylex.props(styles.hint).className} tone="tertiary" variant="caption">
        {scale}% · [ ] scenario · T theme · D scale
      </LumenText>
    </header>
  );
}
