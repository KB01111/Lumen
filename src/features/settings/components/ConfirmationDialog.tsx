import type {ReactNode} from 'react';

import * as stylex from '@stylexjs/stylex';
import {Dialog, DialogTrigger, Heading, Modal, ModalOverlay} from 'react-aria-components';

import {LumenButton, type LumenButtonVariant} from '../../../design-system/primitives/LumenButton';
import {LumenText} from '../../../design-system/primitives/LumenText';
import {tokens} from '../../../design-system/tokens.stylex';

const styles = stylex.create({
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 30,
    display: 'grid',
    placeItems: 'center',
    padding: tokens.space12,
    backgroundColor: 'rgba(1, 5, 9, 0.58)',
  },
  modal: {width: 'min(430px, 100%)', outline: 'none'},
  dialog: {
    display: 'grid',
    gap: tokens.space8,
    padding: tokens.space10,
    color: tokens.colorTextPrimary,
    backgroundColor: tokens.colorCanvasElevated,
    borderColor: tokens.colorBorderStrong,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusLarge,
    boxShadow: tokens.shadowAmbient,
    outline: 'none',
  },
  actions: {display: 'flex', justifyContent: 'flex-end', gap: tokens.space5},
});

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
      <ModalOverlay isDismissable {...stylex.props(styles.overlay)}>
        <Modal {...stylex.props(styles.modal)}>
          <Dialog aria-label={title} {...stylex.props(styles.dialog)}>
            {({close}) => (
              <>
                <Heading slot="title"><LumenText as="span" variant="bodyLarge" weight="semibold">{title}</LumenText></Heading>
                <LumenText tone="secondary">{description}</LumenText>
                <div {...stylex.props(styles.actions)}>
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
