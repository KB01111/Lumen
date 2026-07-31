import type {CSSProperties} from 'react';
import {GridListItem} from 'react-aria-components';

import * as stylex from '@stylexjs/stylex';

import {FileGlyph} from '../../design-system/file-glyphs/FileGlyph';
import {LumenText} from '../../design-system/primitives/LumenText';
import {tokens} from '../../design-system/tokens.stylex';
import type {SearchResult} from '../../services/search/search.types';

const styles = stylex.create({
  row: {
    position: 'relative',
    zIndex: tokens.zContent,
    minWidth: 0,
    minHeight: tokens.resultHeightComfortable,
    display: 'grid',
    gridTemplateColumns: {
      default: '36px minmax(0, 1fr) auto minmax(72px, auto) 42px',
      '@media (max-width: 759px)': '36px minmax(0, 1fr) minmax(72px, auto)',
    },
    alignItems: 'center',
    gap: tokens.space6,
    paddingInline: tokens.space8,
    color: tokens.colorTextPrimary,
    borderColor: 'transparent',
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusMedium,
    cursor: 'default',
    outlineColor: 'transparent',
    outlineOffset: '-2px',
    outlineStyle: 'solid',
    outlineWidth: '2px',
  },
  hovered: {
    backgroundColor: tokens.colorSelection,
  },
  focused: {
    outlineColor: tokens.colorFocus,
  },
  disabled: {
    cursor: 'not-allowed',
    opacity: 0.64,
  },
  opening: {
    backgroundColor: tokens.colorSelectionStrong,
    transform: 'scale(0.992)',
    transitionDuration: tokens.durationPress,
    transitionProperty: 'background-color, transform',
    transitionTimingFunction: tokens.easingStandard,
  },
  primary: {
    minWidth: 0,
    display: 'grid',
    gap: tokens.space1,
  },
  titleLine: {
    minWidth: 0,
    display: 'flex',
    alignItems: 'baseline',
    gap: tokens.space4,
  },
  filename: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  extension: {
    flexShrink: 0,
  },
  detailLine: {
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: tokens.space4,
  },
  path: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  fragment: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  badge: {
    display: {
      default: 'block',
      '@media (max-width: 759px)': 'none',
    },
    flexShrink: 0,
    paddingBlock: tokens.space2,
    paddingInline: tokens.space5,
    color: tokens.colorTextSecondary,
    backgroundColor: tokens.colorMaterialInset,
    borderRadius: tokens.radiusRound,
  },
  state: {
    minWidth: '88px',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  shortcut: {
    minWidth: '42px',
    display: {
      default: 'flex',
      '@media (max-width: 759px)': 'none',
    },
    justifyContent: 'flex-end',
    color: tokens.colorTextTertiary,
    fontFamily: tokens.fontFamilyText,
    fontSize: tokens.fontSizeCaption,
  },
});

const sourceLabels: Record<SearchResult['match']['source'], string> = {
  filename: 'Name',
  content: 'Content',
  metadata: 'Metadata',
  ocr: 'OCR',
  semantic: 'Meaning',
  related: 'Related',
};

const availabilityLabels: Record<NonNullable<SearchResult['availability']>, string> = {
  available: '',
  loading: 'Loading',
  unavailable: 'Unavailable',
  permissionDenied: 'Permission required',
};

function formatSize(sizeBytes?: number) {
  if (sizeBytes === undefined) {
    return '';
  }
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function accessibilityLabel(result: SearchResult) {
  const state = availabilityLabels[result.availability ?? 'available'];
  return [result.name, result.path, sourceLabels[result.match.source], state]
    .filter(Boolean)
    .join(', ');
}

export interface ResultRowProps {
  isOpening?: boolean;
  result: SearchResult;
  positionStyle?: CSSProperties;
  positionIndex?: number;
  totalCount?: number;
}

export function ResultRow({
  isOpening = false,
  result,
  positionStyle,
  positionIndex,
  totalCount,
}: ResultRowProps) {
  const isDisabled = (result.availability ?? 'available') !== 'available';
  const stateLabel = availabilityLabels[result.availability ?? 'available'];

  return (
    <GridListItem
      id={result.id}
      aria-label={accessibilityLabel(result)}
      aria-posinset={positionIndex === undefined ? undefined : positionIndex + 1}
      aria-setsize={totalCount}
      className={({isFocusVisible, isHovered, isSelected}) =>
        stylex.props(
          styles.row,
          isHovered && styles.hovered,
          isFocusVisible && styles.focused,
          isDisabled && styles.disabled,
          isSelected && styles.hovered,
          isOpening && styles.opening,
        ).className ?? ''
      }
      data-opening={isOpening || undefined}
      data-result-id={result.id}
      isDisabled={isDisabled}
      style={positionStyle}
      textValue={result.name}
    >
      {({isSelected}) => (
        <>
          <FileGlyph kind={result.kind} selected={isSelected} size="large" />
          <div {...stylex.props(styles.primary)}>
            <div {...stylex.props(styles.titleLine)}>
              <LumenText
                className={stylex.props(styles.filename).className}
                variant="body"
                weight="medium"
              >
                {result.name}
              </LumenText>
              {result.metadata.extension ? (
                <LumenText
                  className={stylex.props(styles.extension).className}
                  tone="tertiary"
                  variant="caption"
                >
                  {result.metadata.extension.toUpperCase()}
                </LumenText>
              ) : null}
            </div>
            <div {...stylex.props(styles.detailLine)}>
              <LumenText
                className={stylex.props(styles.path).className}
                title={result.path}
                tone="tertiary"
                variant="caption"
              >
                {result.path}
              </LumenText>
              {result.match.fragment ? (
                <LumenText
                  className={stylex.props(styles.fragment).className}
                  tone="secondary"
                  variant="caption"
                >
                  {result.match.fragment}
                </LumenText>
              ) : null}
            </div>
          </div>
          <LumenText
            className={stylex.props(styles.badge).className}
            tone="secondary"
            variant="caption"
          >
            {sourceLabels[result.match.source]}
          </LumenText>
          <div {...stylex.props(styles.state)}>
            <LumenText tone={isDisabled ? 'secondary' : 'tertiary'} variant="caption">
              {stateLabel || formatSize(result.metadata.sizeBytes)}
            </LumenText>
          </div>
          <kbd aria-hidden="true" {...stylex.props(styles.shortcut)}>
            Enter
          </kbd>
        </>
      )}
    </GridListItem>
  );
}
