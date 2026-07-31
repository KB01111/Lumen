import * as stylex from '@stylexjs/stylex';

import {FileGlyph} from '../../design-system/file-glyphs/FileGlyph';
import {LumenText} from '../../design-system/primitives/LumenText';
import {tokens} from '../../design-system/tokens.stylex';
import type {FilePreview, SearchResultKind} from '../../services/search/search.types';
import {SafeMarkdown} from './SafeMarkdown';

const styles = stylex.create({
  root: {
    minHeight: '280px',
    minWidth: 0,
    display: 'grid',
    alignContent: 'start',
    gap: tokens.space12,
    padding: tokens.space12,
  },
  code: {
    margin: 0,
    padding: tokens.space8,
    overflow: 'auto',
    color: tokens.colorTextPrimary,
    backgroundColor: tokens.colorMaterialInset,
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusMedium,
    fontFamily: '"Cascadia Code", Consolas, monospace',
    fontSize: tokens.fontSizeMeta,
    lineHeight: tokens.lineHeightRelaxed,
    whiteSpace: 'pre-wrap',
  },
  prose: {
    margin: 0,
    color: tokens.colorTextSecondary,
    fontFamily: tokens.fontFamilyText,
    fontSize: tokens.fontSizeBody,
    lineHeight: tokens.lineHeightRelaxed,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  folderList: {
    display: 'grid',
    gap: tokens.space3,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  folderItem: {
    minHeight: tokens.controlHeightLarge,
    display: 'grid',
    gridTemplateColumns: '32px minmax(0, 1fr)',
    alignItems: 'center',
    gap: tokens.space6,
    paddingInline: tokens.space6,
    borderRadius: tokens.radiusSmall,
  },
  media: {
    width: '100%',
    maxHeight: '280px',
    display: 'block',
    objectFit: 'contain',
    backgroundColor: tokens.colorMaterialInset,
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusMedium,
  },
  placeholder: {
    minHeight: '176px',
    display: 'grid',
    placeItems: 'center',
    gap: tokens.space6,
    padding: tokens.space12,
    textAlign: 'center',
    backgroundColor: tokens.colorMaterialInset,
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusMedium,
  },
  tableWrap: {
    minWidth: 0,
    overflow: 'auto',
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusMedium,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    color: tokens.colorTextSecondary,
    fontFamily: tokens.fontFamilyText,
    fontSize: tokens.fontSizeMeta,
  },
  cell: {
    minWidth: '96px',
    paddingBlock: tokens.space5,
    paddingInline: tokens.space6,
    textAlign: 'start',
    borderBottomColor: tokens.colorBorderSubtle,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
  },
  headerCell: {
    color: tokens.colorTextPrimary,
    backgroundColor: tokens.colorMaterialRaised,
    fontWeight: tokens.fontWeightSemibold,
  },
  metadata: {
    display: 'grid',
    gridTemplateColumns: 'minmax(84px, auto) minmax(0, 1fr)',
    gap: tokens.space4,
    margin: 0,
    paddingTop: tokens.space8,
    borderTopColor: tokens.colorBorderSubtle,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
  },
  metadataKey: {color: tokens.colorTextTertiary},
  metadataValue: {
    margin: 0,
    color: tokens.colorTextSecondary,
    overflowWrap: 'anywhere',
  },
});

function isSafeImageSource(sourceUrl?: string) {
  if (!sourceUrl) {
    return false;
  }
  if (/^data:image\/(?:avif|gif|jpeg|png|webp);base64,/i.test(sourceUrl)) {
    return true;
  }
  try {
    return ['https:', 'http:', 'blob:', 'asset:', 'tauri:'].includes(
      new URL(sourceUrl).protocol,
    );
  } catch {
    return false;
  }
}

function Placeholder({kind, label}: {kind: SearchResultKind; label: string}) {
  return (
    <div {...stylex.props(styles.placeholder)}>
      <FileGlyph kind={kind} size={48} />
      <LumenText tone="secondary" variant="bodyLarge" weight="medium">
        {label}
      </LumenText>
    </div>
  );
}

function previewBody(preview: FilePreview) {
  switch (preview.kind) {
    case 'folder':
      return preview.children?.length ? (
        <ul {...stylex.props(styles.folderList)}>
          {preview.children.map((child) => (
            <li key={child.id} {...stylex.props(styles.folderItem)}>
              <FileGlyph kind={child.kind} size="medium" />
              <LumenText>{child.name}</LumenText>
            </li>
          ))}
        </ul>
      ) : <Placeholder kind="folder" label="This folder is empty" />;
    case 'text':
      return <p {...stylex.props(styles.prose)}>{preview.text || 'No text preview available.'}</p>;
    case 'source':
      return <pre {...stylex.props(styles.code)}><code>{preview.text || 'No source preview available.'}</code></pre>;
    case 'markdown':
      return <SafeMarkdown source={preview.text || 'No Markdown preview available.'} />;
    case 'pdf':
      return <Placeholder kind="pdf" label="PDF document" />;
    case 'document':
      return <Placeholder kind="document" label="Document preview" />;
    case 'presentation':
      return <Placeholder kind="presentation" label="Presentation preview" />;
    case 'spreadsheet':
      return preview.rows?.length ? (
        <div {...stylex.props(styles.tableWrap)}>
          <table {...stylex.props(styles.table)}>
            {preview.columns?.length ? (
              <thead>
                <tr>
                  {preview.columns.map((column, index) => (
                    <th key={`${column}-${index}`} {...stylex.props(styles.cell, styles.headerCell)} scope="col">{column}</th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {preview.rows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`cell-${rowIndex}-${cellIndex}`} {...stylex.props(styles.cell)}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Placeholder kind="spreadsheet" label="Spreadsheet preview" />;
    case 'image':
      return isSafeImageSource(preview.sourceUrl) ? (
        <img
          {...stylex.props(styles.media)}
          alt={preview.title}
          decoding="async"
          src={preview.sourceUrl}
        />
      ) : <Placeholder kind="image" label="Image preview unavailable" />;
    case 'audio':
      return <Placeholder kind="audio" label="Audio file" />;
    case 'video':
      return <Placeholder kind="video" label="Video file" />;
    case 'permissionDenied':
      return <Placeholder kind="unknown" label="Permission required" />;
    case 'unsupported':
      return <Placeholder kind="unknown" label="Preview unavailable" />;
  }
}

export function PreviewContent({preview}: {preview: FilePreview}) {
  const metadata = Object.entries(preview.metadata);
  return (
    <div {...stylex.props(styles.root)} data-testid={`preview-${preview.kind}`}>
      {previewBody(preview)}
      {metadata.length ? (
        <dl {...stylex.props(styles.metadata)}>
          {metadata.flatMap(([key, value]) => [
            <dt key={`${key}-key`} {...stylex.props(styles.metadataKey)}>{key}</dt>,
            <dd key={`${key}-value`} {...stylex.props(styles.metadataValue)}>{value}</dd>,
          ])}
        </dl>
      ) : null}
    </div>
  );
}
