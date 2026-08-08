import type {ReactNode} from 'react';

import {Dialog, DialogTrigger, Heading, Modal, ModalOverlay} from 'react-aria-components';

import {LumenButton, type LumenButtonVariant} from '../../../design-system/primitives/LumenButton';
import {LumenText} from '../../../design-system/primitives/LumenText';

export interface ConfirmationDialogProps {
  cancelLabel?: string;
  children: ReactNode;
  confirmLabel: string;
  confirmVariant?: LumenButtonVariant;
  description: string;
  title: string;
  onConfirm(): void;
}

export function ConfirmationDialog({cancelLabel = 'Cancel', children, confirmLabel, confirmVariant = 'danger', description, title, onConfirm}: ConfirmationDialogProps) {
  return (
    <DialogTrigger>
      {children}
      <ModalOverlay className="fixed inset-0 z-30 grid place-items-center bg-scrim p-8" isDismissable>
        <Modal className="w-full max-w-[430px] outline-none">
          <Dialog aria-label={title} className="grid gap-6 rounded-surface border border-border-strong bg-surface-raised p-6 text-text-primary shadow-surface outline-none">
            {({close}) => (
              <>
                <Heading slot="title"><LumenText as="span" variant="bodyLarge" weight="semibold">{title}</LumenText></Heading>
                <LumenText tone="secondary">{description}</LumenText>
                <div className="flex justify-end gap-3">
                  <LumenButton size="small" variant="quiet" onPress={close}>{cancelLabel}</LumenButton>
                  <LumenButton
                    size="small"
                    variant={confirmVariant}
                    onPress={() => {
                      onConfirm();
                      close();
                    }}
                  >
                    {confirmLabel}
                  </LumenButton>
                </div>
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
