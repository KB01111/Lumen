import {useEffect, useRef, type RefObject} from 'react';
import {Dialog, Modal, ModalOverlay} from 'react-aria-components';

import * as stylex from '@stylexjs/stylex';
import {AnimatePresence, motion} from 'motion/react';

import {LumenIconButton} from '../../design-system/primitives/LumenIconButton';
import {LumenUiIcon} from '../../design-system/icons/LumenUiIcon';
import {LumenSurface} from '../../design-system/primitives/LumenSurface';
import {LumenText} from '../../design-system/primitives/LumenText';
import {motionTokens} from '../../design-system/motion';
import {tokens} from '../../design-system/tokens.stylex';
import type {SearchService} from '../../services/search/search-service';
import type {SearchError} from '../../services/search/search.types';
import {PreviewContent} from './PreviewContent';
import {PreviewSkeleton} from './PreviewSkeleton';
import {usePreviewController, type PreviewController} from './usePreviewController';

const styles = stylex.create({
  paneRegion: {
    width: '100%',
    height: '100%',
    minHeight: 0,
  },
  pane: {
    minWidth: 0,
    minHeight: '320px',
    height: '100%',
    display: 'grid',
    gridTemplateRows: 'auto minmax(0, 1fr)',
    overflow: 'hidden',
    borderLeftColor: tokens.colorBorderSubtle,
    borderLeftStyle: 'solid',
    borderLeftWidth: '1px',
  },
  header: {
    minWidth: 0,
    minHeight: '66px',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: tokens.space6,
    paddingBlock: tokens.space6,
    paddingInline: tokens.space12,
    borderBottomColor: tokens.colorBorderSubtle,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
  },
  titleGroup: {
    minWidth: 0,
    display: 'grid',
    gap: tokens.space1,
  },
  truncate: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  body: {
    minHeight: 0,
    overflow: 'auto',
    scrollbarColor: `${tokens.colorBorderStrong} transparent`,
    scrollbarWidth: 'thin',
  },
  centered: {
    minHeight: '280px',
    display: 'grid',
    placeItems: 'center',
    alignContent: 'center',
    gap: tokens.space6,
    padding: tokens.space16,
    textAlign: 'center',
  },
  errorMark: {
    width: '40px',
    height: '40px',
    display: 'grid',
    placeItems: 'center',
    color: tokens.colorError,
    backgroundColor: tokens.colorErrorMuted,
    borderRadius: tokens.radiusRound,
    fontFamily: tokens.fontFamilyDisplay,
    fontSize: tokens.fontSizeTitle,
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: tokens.zOverlay,
    display: 'grid',
    placeItems: 'center',
    padding: tokens.space12,
    backgroundColor: 'rgba(1, 5, 9, 0.52)',
    backdropFilter: 'blur(10px)',
  },
  modal: {
    width: 'min(620px, calc(100vw - 32px))',
    maxHeight: 'min(620px, calc(100vh - 32px))',
    overflow: 'hidden',
    outline: 'none',
  },
  dialog: {
    maxHeight: 'inherit',
    outline: 'none',
  },
  dialogSurface: {
    maxHeight: 'inherit',
    overflow: 'hidden',
    borderColor: tokens.colorBorderStrong,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusLarge,
    boxShadow: tokens.shadowAmbient,
  },
  dialogFrame: {
    maxHeight: 'inherit',
    display: 'grid',
    gridTemplateRows: 'auto minmax(0, 1fr)',
    overflow: 'hidden',
  },
});

export type PreviewPresentation = 'pane' | 'dialog';

export interface PreviewPaneProps {
  fileId: string | null;
  isOpen?: boolean;
  mode?: PreviewPresentation;
  reducedMotion?: boolean;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  service: SearchService;
  onOpenChange?: (isOpen: boolean) => void;
}

function stateTitle(controller: PreviewController) {
  if (controller.preview) {
    return controller.preview.title;
  }
  if (controller.lifecycle === 'loading') {
    return 'Loading preview';
  }
  if (controller.lifecycle === 'error') {
    return controller.error?.code === 'permission-denied'
      ? 'Permission required'
      : 'Preview unavailable';
  }
  return 'Preview';
}

function PreviewError({error}: {error: SearchError | null}) {
  const title = error?.code === 'permission-denied'
    ? 'Permission required'
    : 'Preview unavailable';
  return (
    <div role="alert" {...stylex.props(styles.centered)}>
      <span aria-hidden="true" {...stylex.props(styles.errorMark)}>!</span>
      <LumenText variant="bodyLarge" weight="semibold">{title}</LumenText>
      <LumenText tone="secondary">{error?.message ?? 'This file cannot be previewed.'}</LumenText>
    </div>
  );
}

function PreviewState({
  controller,
  reducedMotion,
}: {
  controller: PreviewController;
  reducedMotion: boolean;
}) {
  if (controller.lifecycle === 'loading') {
    return <PreviewSkeleton reducedMotion={reducedMotion} />;
  }
  if (controller.lifecycle === 'error') {
    return <PreviewError error={controller.error} />;
  }
  if (controller.preview) {
    return <PreviewContent preview={controller.preview} />;
  }
  return (
    <div {...stylex.props(styles.centered)}>
      <LumenText tone="secondary" variant="bodyLarge">Select a result to preview</LumenText>
      <LumenText tone="tertiary" variant="caption">Alt + Enter opens file details</LumenText>
    </div>
  );
}

function PreviewFrame({
  controller,
  mode,
  reducedMotion,
  onClose,
}: {
  controller: PreviewController;
  mode: PreviewPresentation;
  reducedMotion: boolean;
  onClose?: () => void;
}) {
  const title = stateTitle(controller);
  const subtitle = controller.preview?.subtitle;
  return (
    <div {...stylex.props(mode === 'pane' ? styles.pane : styles.dialogFrame)}>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.titleGroup)}>
          <LumenText
            className={stylex.props(styles.truncate).className}
            variant="bodyLarge"
            weight="semibold"
          >
            {title}
          </LumenText>
          {subtitle ? (
            <LumenText
              className={stylex.props(styles.truncate).className}
              title={subtitle}
              tone="tertiary"
              variant="caption"
            >
              {subtitle}
            </LumenText>
          ) : null}
        </div>
        {onClose ? (
          <LumenIconButton aria-label="Close details" size="small" onPress={onClose}>
            <LumenUiIcon name="close" size="small" />
          </LumenIconButton>
        ) : null}
      </header>
      <div {...stylex.props(styles.body)}>
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={`${controller.lifecycle}-${controller.preview?.fileId ?? 'none'}`}
            initial={reducedMotion ? false : {opacity: 0, x: 8}}
            animate={{opacity: 1, x: 0}}
            exit={reducedMotion ? undefined : {opacity: 0, x: -6}}
            transition={{duration: reducedMotion ? 0 : motionTokens.duration.preview}}
          >
            <PreviewState controller={controller} reducedMotion={reducedMotion} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export function PreviewPane({
  fileId,
  isOpen = true,
  mode = 'pane',
  reducedMotion = false,
  restoreFocusRef,
  service,
  onOpenChange,
}: PreviewPaneProps) {
  const controller = usePreviewController(
    mode === 'dialog' && !isOpen ? null : fileId,
    service,
  );
  const wasOpen = useRef(isOpen);

  useEffect(() => {
    if (wasOpen.current && !isOpen) {
      restoreFocusRef?.current?.focus();
    }
    wasOpen.current = isOpen;
  }, [isOpen, restoreFocusRef]);

  if (mode === 'pane') {
    return (
      <section
        aria-label="File preview"
        tabIndex={0}
        {...stylex.props(styles.paneRegion)}
      >
        <PreviewFrame controller={controller} mode={mode} reducedMotion={reducedMotion} />
      </section>
    );
  }

  return (
    <ModalOverlay
      isDismissable
      isOpen={isOpen}
      className={`${stylex.props(styles.overlay).className ?? ''} lumen-preview-overlay`}
      onOpenChange={onOpenChange}
    >
      <Modal className={`${stylex.props(styles.modal).className ?? ''} lumen-preview-modal`}>
        <Dialog aria-label="File details" className={stylex.props(styles.dialog).className}>
          <LumenSurface className={stylex.props(styles.dialogSurface).className} material="raised">
            <PreviewFrame
              controller={controller}
              mode={mode}
              reducedMotion={reducedMotion}
              onClose={() => onOpenChange?.(false)}
            />
          </LumenSurface>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
