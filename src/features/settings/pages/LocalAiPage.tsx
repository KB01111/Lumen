import {useCallback, useEffect, useState} from 'react';

import {ArrowClockwiseIcon, CpuIcon, DownloadSimpleIcon, GraphicsCardIcon, WarningCircleIcon} from '@phosphor-icons/react';
import * as stylex from '@stylexjs/stylex';
import {ProgressBar} from 'react-aria-components';

import {LocalAiIcon, NpuIcon} from '../../../design-system/icons/lumen-icons';
import {LumenButton} from '../../../design-system/primitives/LumenButton';
import {LumenText} from '../../../design-system/primitives/LumenText';
import {tokens} from '../../../design-system/tokens.stylex';
import {useGatewayStore} from '../../gateway/gateway.store';
import type {HardwareState, LocalAiViewModel, ModelState} from '../../gateway/gateway.types';
import {SettingRow} from '../components/SettingRow';
import {SettingSection} from '../components/SettingSection';
import {SettingsCallout, SettingsPage} from '../components/SettingsPage';
import {StatusBadge} from '../components/StatusBadge';
import {LumenSwitch} from '../components/SettingsControls';
import {useSettingsStore} from '../settings.store';
import {isNativeRuntime, nativeAiService, type LocalRuntimeHealth} from '../../../services/ai/native-ai-service';

const styles = stylex.create({
  hardware: {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    alignItems: 'center',
    gap: tokens.space8,
    padding: tokens.space10,
    backgroundColor: tokens.colorMaterialInset,
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusLarge,
  },
  icon: {
    width: '52px',
    height: '52px',
    display: 'grid',
    placeItems: 'center',
    color: tokens.colorAccent,
    backgroundColor: tokens.colorAccentMuted,
    borderRadius: tokens.radiusLarge,
  },
  text: {display: 'grid', gap: tokens.space3},
  title: {display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: tokens.space4},
  progress: {width: '190px', display: 'grid', gap: tokens.space3},
  progressHeader: {display: 'flex', justifyContent: 'space-between', gap: tokens.space4},
  track: {height: '5px', overflow: 'hidden', backgroundColor: tokens.colorMaterialRaised, borderRadius: tokens.radiusRound},
  fill: {height: '100%', backgroundColor: tokens.colorAccent, borderRadius: tokens.radiusRound, transition: `width ${tokens.durationSelection} ${tokens.easingStandard}`},
});

const hardwareCopy: Record<HardwareState, {label: string; description: string; icon: React.ReactNode; tone: 'success' | 'info' | 'warning'}> = {
  npu: {label: 'Copilot+ NPU detected', description: 'The future on-device provider can prefer the neural processor.', icon: <NpuIcon size={28} />, tone: 'success'},
  gpu: {label: 'GPU detected', description: 'A compatible graphics path is available for a future local provider.', icon: <GraphicsCardIcon size={28} />, tone: 'success'},
  cpu: {label: 'CPU fallback', description: 'Local inference can remain available at a lower throughput.', icon: <CpuIcon size={28} />, tone: 'info'},
  unavailable: {label: 'Provider unavailable', description: 'No production local inference runtime is connected in phase one.', icon: <WarningCircleIcon size={28} />, tone: 'warning'},
};

const modelCopy: Record<ModelState, {label: string; description: string; tone: 'success' | 'info' | 'warning' | 'error'}> = {
  missing: {label: 'Model missing', description: 'Choose a future model before semantic features can start.', tone: 'warning'},
  downloading: {label: 'Model downloading', description: 'The determinate progress state is ready for a real provider.', tone: 'info'},
  loading: {label: 'Model loading', description: 'Weights are being prepared by the deterministic preview.', tone: 'info'},
  ready: {label: 'Model ready', description: 'The local provider reports a ready interface state.', tone: 'success'},
  failed: {label: 'Provider failed', description: 'The local provider returned a recoverable phase-one error.', tone: 'error'},
  'fallback-active': {label: 'Provider fallback active', description: 'Lumen has moved to CPU fallback without interrupting exact search.', tone: 'warning'},
};

function ModelProgress({value}: {value: number}) {
  return (
    <ProgressBar aria-label="Model download" value={value} {...stylex.props(styles.progress)}>
      {({percentage, valueText}) => (
        <>
          <div {...stylex.props(styles.progressHeader)}>
            <LumenText variant="meta">Downloading</LumenText>
            <LumenText tone="tertiary" variant="meta">{valueText}</LumenText>
          </div>
          <div {...stylex.props(styles.track)}><div {...stylex.props(styles.fill)} style={{width: `${percentage}%`}} /></div>
        </>
      )}
    </ProgressBar>
  );
}

export function LocalAiPage({model}: {model?: Pick<LocalAiViewModel, 'hardware' | 'state'> & Partial<LocalAiViewModel>}) {
  const storedHardware = useGatewayStore((state) => state.hardwareState);
  const storedModel = useGatewayStore((state) => state.modelState);
  const storedProgress = useGatewayStore((state) => state.modelProgress);
  const modelName = useGatewayStore((state) => state.modelName);
  const providerName = useGatewayStore((state) => state.providerName);
  const setLocalAi = useGatewayStore((state) => state.setLocalAi);
  const keepLocalWarm = useSettingsStore((state) => state.ai.keepLocalWarm);
  const runtimeMode = useSettingsStore((state) => state.ai.runtimeMode);
  const updateAi = useSettingsStore((state) => state.updateAi);
  const [nativeHealth, setNativeHealth] = useState<LocalRuntimeHealth>();
  const [nativeError, setNativeError] = useState('');
  const refreshNative = useCallback(async () => {
    if (!isNativeRuntime() || model) return;
    try {
      setNativeHealth(await nativeAiService.localRuntimeHealth());
      setNativeError('');
    } catch (error) {
      setNativeError(error instanceof Error ? error.message : String(error));
    }
  }, [model]);
  useEffect(() => {
    void refreshNative();
  }, [refreshNative]);
  const nativeHardware: HardwareState | undefined = nativeHealth?.profile === 'laptop-amd-npu'
    ? 'npu'
    : nativeHealth?.profile === 'desktop-nvidia-cuda' ? 'gpu' : nativeHealth ? 'cpu' : undefined;
  const view = {
    hardware: model?.hardware ?? nativeHardware ?? storedHardware,
    state: model?.state ?? (nativeHealth ? (nativeHealth.state === 'ready' ? 'ready' : 'failed') : storedModel),
    progress: model?.progress ?? storedProgress,
    modelName: model?.modelName ?? nativeHealth?.answerModel ?? modelName,
    provider: model?.provider ?? (nativeHealth ? `Lemonade ${nativeHealth.lemonade.version ?? 'missing'} / FLM ${nativeHealth.flm.version ?? 'missing'}` : providerName),
  };
  const hardware = hardwareCopy[view.hardware];
  const state = modelCopy[view.state];

  return (
    <SettingsPage>
      <section data-testid={`hardware-${view.hardware}`} {...stylex.props(styles.hardware)}>
        <span aria-hidden="true" {...stylex.props(styles.icon)}>{hardware.icon}</span>
        <div {...stylex.props(styles.text)}>
          <div {...stylex.props(styles.title)}>
            <LumenText as="h2" variant="bodyLarge" weight="semibold">{hardware.label}</LumenText>
            <StatusBadge tone={hardware.tone}>{view.hardware.toUpperCase()}</StatusBadge>
          </div>
          <LumenText tone="secondary">{hardware.description}</LumenText>
        </div>
      </section>
      <SettingsCallout>
        {nativeHealth
          ? `${nativeHealth.profile} · ${nativeHealth.accelerator}. ${nativeHealth.detail ?? 'The loopback provider is ready.'}`
          : nativeError || 'Exact filename and content search remain independent of local inference.'}
      </SettingsCallout>
      <SettingSection title="Model and provider">
        <SettingRow
          label={view.modelName}
          description={nativeHealth ? `Answers: ${nativeHealth.answerModel}; embeddings: ${nativeHealth.embeddingModel}; transcription: ${nativeHealth.transcriptionModel}.` : state.description}
          status={<StatusBadge tone={state.tone}>{state.label}</StatusBadge>}
        >
          <div data-testid={`model-${view.state}`}>
            {view.state === 'downloading' ? <ModelProgress value={view.progress} /> : null}
            {view.state === 'missing' ? (
              <LumenButton size="small" onPress={() => setLocalAi({state: 'downloading', progress: 8})}>
                <DownloadSimpleIcon aria-hidden="true" size={15} /> Download preview
              </LumenButton>
            ) : null}
            {view.state === 'failed' ? <LumenButton size="small" onPress={() => setLocalAi({state: 'loading'})}>Retry preview</LumenButton> : null}
            {['loading', 'ready', 'fallback-active'].includes(view.state) ? <LocalAiIcon size={22} /> : null}
            {nativeHealth ? <LumenButton aria-label="Refresh local runtime" size="small" variant="quiet" onPress={() => void refreshNative()}><ArrowClockwiseIcon aria-hidden="true" size={15} /> Refresh</LumenButton> : null}
          </div>
        </SettingRow>
        <SettingRow label="Provider" description={nativeHealth?.baseUrl ?? 'No native runtime detected.'}>
          <LumenText tone="secondary" variant="meta">{view.provider}</LumenText>
        </SettingRow>
        <SettingRow label="Keep local model warm" description="Keeps local inference available in Cloud mode; search itself is always warm.">
          <LumenSwitch
            aria-label="Keep local model warm"
            isSelected={keepLocalWarm}
            onChange={(value) => {
              void updateAi({keepLocalWarm: value});
              if (isNativeRuntime()) void nativeAiService.setLocalRuntimeMode(runtimeMode, value).then(refreshNative);
            }}
          />
        </SettingRow>
      </SettingSection>
    </SettingsPage>
  );
}
