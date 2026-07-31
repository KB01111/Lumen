import {
  ArrowSquareOutIcon,
  FolderOpenIcon,
  InfoIcon,
} from '@phosphor-icons/react';
import * as stylex from '@stylexjs/stylex';

import {LumenButton} from '../../design-system/primitives/LumenButton';
import {LumenText} from '../../design-system/primitives/LumenText';
import {tokens} from '../../design-system/tokens.stylex';
import type {SearchResult} from '../../services/search/search.types';

const styles = stylex.create({
  root: {
    minWidth: 0,
    minHeight: '46px',
    display: 'flex',
    alignItems: 'center',
    gap: tokens.space3,
    paddingBlock: tokens.space4,
    paddingInline: tokens.space6,
    borderTopColor: tokens.colorBorderSubtle,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
  },
  context: {
    minWidth: 0,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  actionLabel: {
    display: {
      default: 'inline',
      '@media (max-width: 759px)': 'none',
    },
  },
  shortcut: {
    marginInlineStart: tokens.space2,
    color: tokens.colorTextTertiary,
    fontFamily: tokens.fontFamilyText,
    fontSize: tokens.fontSizeCaption,
  },
});

export interface ContextActionsProps {
  isOpening?: boolean;
  result: SearchResult | null;
  onDetails(): void;
  onOpen(): void;
  onOpenContainingFolder(): void;
}

export function ContextActions({
  isOpening = false,
  result,
  onDetails,
  onOpen,
  onOpenContainingFolder,
}: ContextActionsProps) {
  return (
    <div aria-label="Result actions" {...stylex.props(styles.root)}>
      <LumenText
        className={stylex.props(styles.context).className}
        title={result?.path}
        tone="tertiary"
        variant="caption"
      >
        {result ? result.name : 'Choose a result for actions'}
      </LumenText>
      <LumenButton
        aria-label={isOpening ? 'Opening selected result' : 'Open selected result'}
        isDisabled={!result || isOpening}
        size="small"
        variant="quiet"
        onPress={onOpen}
      >
        <ArrowSquareOutIcon aria-hidden="true" size={15} />
        <span {...stylex.props(styles.actionLabel)}>{isOpening ? 'Opening' : 'Open'}</span>
        <kbd aria-hidden="true" {...stylex.props(styles.shortcut)}>↵</kbd>
      </LumenButton>
      <LumenButton
        aria-label="Open containing folder"
        isDisabled={!result}
        size="small"
        variant="quiet"
        onPress={onOpenContainingFolder}
      >
        <FolderOpenIcon aria-hidden="true" size={15} />
        <span {...stylex.props(styles.actionLabel)}>Folder</span>
      </LumenButton>
      <LumenButton
        aria-label="Show file details"
        isDisabled={!result}
        size="small"
        variant="quiet"
        onPress={onDetails}
      >
        <InfoIcon aria-hidden="true" size={15} />
        <span {...stylex.props(styles.actionLabel)}>Details</span>
      </LumenButton>
    </div>
  );
}
