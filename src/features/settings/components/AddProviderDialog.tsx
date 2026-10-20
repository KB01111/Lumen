import {useEffect, useRef, useState, type ReactNode} from 'react';

import {Dialog, DialogTrigger, Heading, Modal, ModalOverlay} from 'react-aria-components';
import {Button, Field, Input} from '@fluentui/react-components';

import {vendorPresets, type VendorPreset} from '../../../config/vendorPresets';
import {LumenButton} from '../../../design-system/primitives/LumenButton';
import {LumenText} from '../../../design-system/primitives/LumenText';
import {providersApi} from '../../../services/api/providers';
import {toProviderErrorMessage} from '../../../services/providers/providers-service';
import {providerAppSchema, type ProviderApp} from '../../../services/providers/providers.types';

type AddStep = 'pick' | 'form';

export interface AddProviderDialogProps {
  api?: Pick<typeof providersApi, 'add'>;
  app?: ProviderApp;
  children?: ReactNode;
  triggerLabel?: string;
  onAdded?(id: string): void;
}

function newProviderId(preset: VendorPreset): string {
  return `${preset.vendor}-${Date.now().toString(36)}`;
}

export function AddProviderDialog({
  api = providersApi,
  app,
  children,
  triggerLabel = 'Add provider',
  onAdded,
}: AddProviderDialogProps) {
  const [step, setStep] = useState<AddStep>('pick');
  const [preset, setPreset] = useState<VendorPreset | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const reset = () => {
    setStep('pick');
    setPreset(null);
    setBaseUrl('');
    setApiKey('');
    setModel('');
    setError('');
    setPending(false);
  };

  const pick = (next: VendorPreset) => {
    setPreset(next);
    setBaseUrl(next.baseUrl);
    setModel(next.defaultModel);
    setApiKey('');
    setError('');
    setStep('form');
  };

  const canSubmit =
    preset !== null &&
    !pending &&
    baseUrl.trim().length > 0 &&
    model.trim().length > 0 &&
    apiKey.trim().length > 0;

  const submit = async (close: () => void) => {
    if (preset === null || !canSubmit || busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      const id = newProviderId(preset);
      await api.add({
        app: providerAppSchema.parse(preset.app),
        id,
        baseUrl: baseUrl.trim(),
        apiKey,
        model: model.trim(),
      });
      if (mounted.current) { onAdded?.(id); close(); }
    } catch (caught) {
      if (mounted.current) setError(toProviderErrorMessage(caught));
    } finally {
      // Never keep the secret in component state longer than the submit.
      if (mounted.current) { setApiKey(''); setPending(false); }
      busy.current = false;
    }
  };

  return (
    <DialogTrigger
      onOpenChange={(isOpen) => {
        if (isOpen) reset();
        else setApiKey('');
      }}
    >
      {children ?? <LumenButton size="small">{triggerLabel}</LumenButton>}
      <ModalOverlay className="lumen-preview-overlay fixed inset-0 z-30 grid min-h-0 place-items-center overflow-y-auto bg-scrim p-4" isDismissable={!pending} isKeyboardDismissDisabled={pending}>
        <Modal className="lumen-preview-modal max-h-full w-full max-w-[480px] overflow-y-auto outline-none">
          <Dialog aria-label="Add provider" className="grid min-w-0 gap-6 rounded-surface border border-border-strong bg-surface-raised p-6 text-text-primary shadow-surface outline-none [overflow-wrap:anywhere]">
            {({close}) => (
              <>
                <Heading slot="title">
                  <LumenText as="span" variant="bodyLarge" weight="semibold">
                    {step === 'pick' ? 'Add provider' : `Add ${preset?.name ?? 'provider'}`}
                  </LumenText>
                </Heading>
                {step === 'pick' ? (
                  <div className="grid max-h-[320px] gap-2 overflow-y-auto" role="group" aria-label="Vendor presets">
                    {vendorPresets.filter((candidate) => !app || candidate.app === app).map((candidate) => (
                      <Button
                        key={candidate.vendor}
                        aria-label={`Use ${candidate.name}`}
                        size="small"
                        appearance="secondary"
                        disabled={!providerAppSchema.safeParse(candidate.app).success}
                        onClick={() => pick(candidate)}
                      >
                        <span className="flex w-full items-center justify-between gap-4">
                          <span>{candidate.name}</span>
                          <LumenText tone="tertiary" variant="meta">{providerAppSchema.safeParse(candidate.app).success ? candidate.defaultModel : 'Unavailable'}</LumenText>
                        </span>
                      </Button>
                    ))}
                  </div>
                ) : (
                  <div className="grid min-w-0 gap-4">
                    {preset?.requiresOAuth === true ? (
                      <LumenText tone="secondary" variant="meta">
                        API-key profiles require a key. Sidecar OAuth sign-in is managed separately.
                      </LumenText>
                    ) : null}
                    <Field className="min-w-0" label="Base URL">
                      <Input aria-label="Base URL" className="min-w-0 w-full" disabled={pending} placeholder={preset?.baseUrl ?? ''} value={baseUrl} onChange={(_event, data) => setBaseUrl(data.value)} />
                    </Field>
                    <Field className="min-w-0" label={`API key (${preset?.apiKeyField ?? 'key'})`}>
                      <Input aria-label="API key" className="min-w-0 w-full" disabled={pending} placeholder="sk-..." type="password" value={apiKey} onChange={(_event, data) => setApiKey(data.value)} />
                    </Field>
                    <Field className="min-w-0" label="Model">
                      <Input aria-label="Model" className="min-w-0 w-full" disabled={pending} placeholder={preset?.defaultModel ?? ''} value={model} onChange={(_event, data) => setModel(data.value)} />
                    </Field>
                    {error ? <LumenText tone="secondary" variant="meta" role="alert">{error}</LumenText> : null}
                    <div className="flex min-w-0 flex-wrap justify-between gap-3">
                      <Button size="small" appearance="subtle" disabled={pending} onClick={() => { setApiKey(''); setStep('pick'); }}>
                        Back
                      </Button>
                      <Button size="small" appearance="primary" disabled={!canSubmit} onClick={() => void submit(close)}>
                        {pending ? 'Adding…' : 'Add'}
                      </Button>
                    </div>
                  </div>
                )}
                {step === 'pick' ? (
                  <div className="flex justify-end gap-3">
                    <Button size="small" appearance="subtle" onClick={close}>
                      Cancel
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
