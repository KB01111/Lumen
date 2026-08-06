import {useCallback, useEffect, useState} from 'react';

import {ArrowClockwiseIcon, CpuIcon, DownloadSimpleIcon, GraphicsCardIcon, WarningCircleIcon} from '@phosphor-icons/react';
import * as stylex from '@stylexjs/stylex';
import {ProgressBar} from 'react-aria-components';

import {LocalAiIcon, NpuIcon} from '../../../design-system/icons/lumen-icons';
import {LumenButton} from '../../../design-system/primitives/LumenButton';
import {LumenText} from '../../../design-system/primitives/LumenText';
import {tokens} from '../../../design-system/tokens.stylex';
import {isNativeRuntime, nativeAiService, type LocalRuntimeHealth, type RuntimeComponent} from '../../../services/ai/native-ai-service';
import {useGatewayStore} from '../../gateway/gateway.store';
import type {HardwareState, LocalAiViewModel, ModelState} from '../../gateway/gateway.types';
import {SettingRow} from '../components/SettingRow';
import {SettingSection} from '../components/SettingSection';
import {SettingsCallout, SettingsPage} from '../components/SettingsPage';
import {StatusBadge} from '../components/StatusBadge';
import {LumenSwitch} from '../components/SettingsControls';
import {useSettingsStore} from '../settings.store';

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

const nativeRuntimeCopy = {
  ready: {label: 'Runtime ready', description: 'The detected local runtime reports that it is ready.', tone: 'success' as const},
  stopped: {label: 'Runtime stopped', description: 'The detected local runtime is installed but not currently running.', tone: 'warning' as const},
  'update-required': {label: 'Runtime update required', description: 'The detected local runtime needs an update before it can serve requests.', tone: 'warning' as const},
  unavailable: {label: 'Runtime health unavailable', description: 'Lumen could not retrieve local runtime health.', tone: 'error' as const},
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

function nativeHardwareCopy(health: LocalRuntimeHealth | undefined) {
  if (!health) {
    return {hardware: 'unavailable', label: 'Local runtime unavailable', description: 'Native runtime health has not been retrieved.', icon: <WarningCircleIcon size={28} />, tone: 'warning' as const};
  }
  if (health.profile === 'laptop-amd-npu') {
    return {hardware: 'npu', label: 'AMD NPU runtime detected', description: `${health.accelerator} is reported by the native runtime.`, icon: <NpuIcon size={28} />, tone: 'success' as const};
  }
  if (health.profile === 'desktop-nvidia-cuda') {
    return {hardware: 'gpu', label: 'NVIDIA CUDA runtime detected', description: `${health.accelerator} is reported by the native runtime.`, icon: <GraphicsCardIcon size={28} />, tone: 'success' as const};
  }
  return {hardware: 'cpu', label: 'Local CPU runtime detected', description: `${health.accelerator} is reported by the native runtime.`, icon: <CpuIcon size={28} />, tone: 'info' as const};
}

function componentStatus(component: RuntimeComponent) {
  if (component.state === 'ready') return {label: 'Ready', tone: 'success' as const};
  if (component.state === 'missing') return {label: 'Missing', tone: 'warning' as const};
  return {label: 'Update required', tone: 'warning' as const};
}

export function LocalAiPage({model}: {model?: Pick<LocalAiViewModel, 'hardware' | 'state'> & Partial<LocalAiViewModel>}) {
  const storedHardware = useGatewayStore((state) => state.hardwareState);
  const storedModel = useGatewayStore((state) => state.modelState);
  const storedProgress = useGatewayStore((state) => state.modelProgress);
  const storedModelName = useGatewayStore((state) => state.modelName);
  const storedProviderName = useGatewayStore((state) => state.providerName);
  const setLocalAi = useGatewayStore((state) => state.setLocalAi);
  const keepLocalWarm = useSettingsStore((state) => state.ai.keepLocalWarm);
  const runtimeMode = useSettingsStore((state) => state.ai.runtimeMode);
  const updateAi = useSettingsStore((state) => state.updateAi);
  const native = isNativeRuntime() && !model;
  const [nativeHealth, setNativeHealth] = useState<LocalRuntimeHealth>();
  const [nativeError, setNativeError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [keepWarmBusy, setKeepWarmBusy] = useState(false);

  const refreshNative = useCallback(async () => {
    if (!native) return;
    setRefreshing(true);
    try {
      setNativeHealth(await nativeAiService.localRuntimeHealth());
      setNativeError('');
    } catch {
      setNativeHealth(undefined);
      setNativeError('Local runtime health could not be retrieved.');
    } finally {
      setRefreshing(false);
    }
  }, [native]);

  useEffect(() => {
    void refreshNative();
  }, [refreshNative]);

  const previewView = {
    hardware: model?.hardware ?? storedHardware,
    state: model?.state ?? storedModel,
    progress: model?.progress ?? storedProgress,
    modelName: model?.modelName ?? storedModelName,
    provider: model?.provider ?? storedProviderName,
  };
  const nativeHardware = nativeHardwareCopy(nativeHealth);
  const hardware = native ? nativeHardware : hardwareCopy[previewView.hardware];
  const state = native
    ? nativeRuntimeCopy[nativeHealth?.state ?? 'unavailable']
    : modelCopy[previewView.state];
  const modelName = native ? nativeHealth?.answerModel ?? 'Local runtime unavailable' : previewView.modelName;

  const changeKeepWarm = async (value: boolean) => {
    if (!native) {
      await updateAi({keepLocalWarm: value});
      return;
    }
    if (keepWarmBusy) return;
    const previous = keepLocalWarm;
    setKeepWarmBusy(true);
    setNativeError('');
    try {
      await nativeAiService.setLocalRuntimeMode(runtimeMode, value);
    } catch {
      setNativeError('The native runtime did not accept the keep-warm change. Your saved setting was not changed.');
      setKeepWarmBusy(false);
      return;
    }

    if (await updateAi({keepLocalWarm: value})) {
      setKeepWarmBusy(false);
      await refreshNative();
      return;
    }

    useSettingsStore.setState((current) => ({ai: {...current.ai, keepLocalWarm: previous}}));
    try {
      await nativeAiService.setLocalRuntimeMode(runtimeMode, previous);
      setNativeError('The keep-warm setting was not saved. The native runtime was restored.');
    } catch {
      setNativeError('The keep-warm setting was not saved, and the native runtime could not be restored.');
    } finally {
      setKeepWarmBusy(false);
    }
  };

  return (
    <SettingsPage>
      <section data-testid={`hardware-${native ? nativeHardware.hardware : previewView.hardware}`} {...stylex.props(styles.hardware)}>
        <span aria-hidden="true" {...stylex.props(styles.icon)}>{hardware.icon}</span>
        <div {...stylex.props(styles.text)}>
          <div {...stylex.props(styles.title)}>
            <LumenText as="h2" variant="bodyLarge" weight="semibold">{hardware.label}</LumenText>
            <StatusBadge tone={hardware.tone}>{(native ? nativeHardware.hardware : previewView.hardware).toUpperCase()}</StatusBadge>
          </div>
          <LumenText tone="secondary">{hardware.description}</LumenText>
        </div>
      </section>
      <SettingsCallout>
        {native
          ? nativeHealth
            ? `${nativeHealth.profile} · ${nativeHealth.accelerator}. ${nativeHealth.detail ?? 'The native runtime reported its current state.'}`
            : nativeError || 'Checking native local runtime health…'
          : 'Exact filename and content search remain independent of local inference.'}
      </SettingsCallout>
      <SettingSection title="Model and provider">
        <SettingRow
          label={modelName}
          description={nativeHealth ? `Answers: ${nativeHealth.answerModel}; embeddings: ${nativeHealth.embeddingModel}; transcription: ${nativeHealth.transcriptionModel}.` : state.description}
          status={<StatusBadge tone={state.tone}>{state.label}</StatusBadge>}
        >
          <div data-testid={`model-${native ? nativeHealth?.state ?? 'unavailable' : previewView.state}`}>
            {!native && previewView.state === 'downloading' ? <ModelProgress value={previewView.progress} /> : null}
            {!native && previewView.state === 'missing' ? (
              <LumenButton size="small" onPress={() => setLocalAi({state: 'downloading', progress: 8})}>
                <DownloadSimpleIcon aria-hidden="true" size={15} /> Download preview
              </LumenButton>
            ) : null}
            {!native && previewView.state === 'failed' ? <LumenButton size="small" onPress={() => setLocalAi({state: 'loading'})}>Retry preview</LumenButton> : null}
            {!native && ['loading', 'ready', 'fallback-active'].includes(previewView.state) ? <LocalAiIcon size={22} /> : null}
            {native ? <LumenButton aria-label="Refresh local runtime" isDisabled={refreshing} size="small" variant="quiet" onPress={() => void refreshNative()}><ArrowClockwiseIcon aria-hidden="true" size={15} /> Refresh</LumenButton> : null}
          </div>
        </SettingRow>
        <SettingRow label="Provider" description={native ? nativeHealth?.baseUrl ?? 'Native runtime health is unavailable.' : 'No native runtime detected.'}>
          <LumenText tone="secondary" variant="meta">{native ? nativeHealth ? `Lemonade ${nativeHealth.lemonade.version ?? 'missing'} / FLM ${nativeHealth.flm.version ?? 'missing'}` : 'Unavailable' : previewView.provider}</LumenText>
        </SettingRow>
        <SettingRow label="Keep local model warm" description="Keeps local inference available in Cloud mode; search itself is always warm.">
          <LumenSwitch
            aria-label="Keep local model warm"
            isDisabled={keepWarmBusy}
            isSelected={keepLocalWarm}
            onChange={(value) => void changeKeepWarm(value)}
          />
        </SettingRow>
      </SettingSection>
      {native && nativeHealth ? (
        <SettingSection title="Native runtime components" description="Detected versions are reported by the native local-runtime health check.">
          {([
            {label: 'Lemonade', component: nativeHealth.lemonade},
            {label: 'FLM', component: nativeHealth.flm},
            {label: 'mistral.rs', component: nativeHealth.mistralRs},
          ] satisfies Array<{label: string; component: RuntimeComponent}>).map(({label, component}) => {
            const status = componentStatus(component);
            return (
              <SettingRow key={label} label={label} description={`Required ${component.requiredVersion}; ${component.version ? `detected ${component.version}` : 'no installed version reported'}.`} status={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>}>
                <LumenText tone="tertiary" variant="meta">{component.installed ? 'Installed' : 'Not installed'}</LumenText>
              </SettingRow>
            );
          })}
        </SettingSection>
      ) : null}
    </SettingsPage>
  );
}
