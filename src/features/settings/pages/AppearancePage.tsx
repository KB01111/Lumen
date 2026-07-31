import * as stylex from '@stylexjs/stylex';

import {LumenMark} from '../../../design-system/icons/LumenMark';
import {LumenText} from '../../../design-system/primitives/LumenText';
import {tokens} from '../../../design-system/tokens.stylex';
import {useAppearanceStore} from '../../../state/appearance.store';
import {SettingRow} from '../components/SettingRow';
import {SettingSection} from '../components/SettingSection';
import {LumenSelect, LumenSlider, LumenSwitch} from '../components/SettingsControls';
import {SettingsPage} from '../components/SettingsPage';
import {useSettingsStore} from '../settings.store';

const styles = stylex.create({
  preview: {
    minHeight: '118px',
    display: 'grid',
    placeItems: 'center',
    overflow: 'hidden',
    backgroundColor: tokens.colorCanvas,
    backgroundImage: 'radial-gradient(circle at 70% 25%, rgba(54, 143, 205, 0.35), transparent 42%), radial-gradient(circle at 18% 82%, rgba(53, 196, 154, 0.18), transparent 38%)',
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusLarge,
  },
  previewShell: {
    width: '78%',
    minHeight: '52px',
    display: 'flex',
    alignItems: 'center',
    gap: tokens.space6,
    paddingInline: tokens.space6,
    backgroundColor: tokens.colorMaterialBackdrop,
    backdropFilter: `blur(${tokens.blurGlass})`,
    borderColor: tokens.colorBorderStrong,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusLauncher,
    boxShadow: tokens.shadowAmbient,
  },
  line: {height: '7px', flex: 1, backgroundColor: tokens.colorBorderStrong, borderRadius: tokens.radiusRound},
});

export function AppearancePage() {
  const mode = useAppearanceStore((state) => state.mode);
  const transparency = useAppearanceStore((state) => state.transparency);
  const density = useAppearanceStore((state) => state.density);
  const preview = useAppearanceStore((state) => state.preview);
  const motion = useAppearanceStore((state) => state.motion);
  const effects = useAppearanceStore((state) => state.effects);
  const setMode = useAppearanceStore((state) => state.setMode);
  const setTransparency = useAppearanceStore((state) => state.setTransparency);
  const setDensity = useAppearanceStore((state) => state.setDensity);
  const setPreview = useAppearanceStore((state) => state.setPreview);
  const setMotion = useAppearanceStore((state) => state.setMotion);
  const setEffects = useAppearanceStore((state) => state.setEffects);
  const presentation = useSettingsStore((state) => state.presentation);
  const updatePresentation = useSettingsStore((state) => state.updatePresentation);

  return (
    <SettingsPage>
      <div aria-label="Appearance preview" {...stylex.props(styles.preview)}>
        <div {...stylex.props(styles.previewShell)} style={{opacity: Math.max(0.55, presentation.glassIntensity / 100)}}>
          <LumenMark size="medium" />
          <span aria-hidden="true" {...stylex.props(styles.line)} />
          <LumenText tone="tertiary" variant="caption">Preview</LumenText>
        </div>
      </div>
      <SettingSection title="Theme and material">
        <SettingRow label="Appearance" description="Follow Windows or choose a fixed light or dark surface.">
          <LumenSelect
            aria-label="Appearance mode"
            options={[{id: 'system', label: 'System'}, {id: 'light', label: 'Light'}, {id: 'dark', label: 'Dark'}]}
            value={mode}
            onChange={(value) => void setMode(value)}
          />
        </SettingRow>
        <SettingRow label="Use transparency" description="Disable for an opaque, wallpaper-independent surface.">
          <LumenSwitch
            aria-label="Use transparency"
            isSelected={transparency !== 'disabled'}
            onChange={(selected) => void setTransparency(selected ? 'native' : 'disabled')}
          />
        </SettingRow>
        <SettingRow label="Glass intensity" description="Adjust the luminosity of the internal material layers.">
          <LumenSlider
            label="Glass intensity"
            value={presentation.glassIntensity}
            onChange={(glassIntensity) => void updatePresentation({glassIntensity})}
          />
        </SettingRow>
        <SettingRow label="Visual effects" description="Reduce glow, noise, and decorative depth while retaining structure.">
          <LumenSelect
            aria-label="Visual effects"
            options={[{id: 'full', label: 'Full'}, {id: 'reduced', label: 'Reduced'}]}
            value={effects}
            onChange={(value) => void setEffects(value)}
          />
        </SettingRow>
      </SettingSection>
      <SettingSection title="Results and motion">
        <SettingRow label="Result density">
          <LumenSelect
            aria-label="Result density"
            options={[{id: 'comfortable', label: 'Comfortable'}, {id: 'compact', label: 'Compact'}]}
            value={density}
            onChange={(value) => void setDensity(value)}
          />
        </SettingRow>
        <SettingRow label="Preview visibility">
          <LumenSelect
            aria-label="Preview visibility"
            options={[{id: 'automatic', label: 'Automatic'}, {id: 'always', label: 'Always'}, {id: 'never', label: 'Never'}]}
            value={preview}
            onChange={(value) => void setPreview(value)}
          />
        </SettingRow>
        <SettingRow label="Motion level" description="System follows the Windows reduced-motion preference.">
          <LumenSelect
            aria-label="Motion level"
            options={[{id: 'system', label: 'System'}, {id: 'full', label: 'Full'}, {id: 'reduced', label: 'Reduced'}]}
            value={motion}
            onChange={(value) => void setMotion(value)}
          />
        </SettingRow>
        <SettingRow label="Synchronize reduced motion" description="Keep Lumen aligned with the Windows accessibility setting.">
          <LumenSwitch
            aria-label="Synchronize reduced motion"
            isSelected={presentation.synchronizeReducedMotion}
            onChange={(synchronizeReducedMotion) => void updatePresentation({synchronizeReducedMotion})}
          />
        </SettingRow>
      </SettingSection>
    </SettingsPage>
  );
}
