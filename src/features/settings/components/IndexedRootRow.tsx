import {useState} from 'react';

import {FolderSimpleIcon, PauseIcon, PlayIcon, TrashIcon, XIcon} from '@phosphor-icons/react';
import * as stylex from '@stylexjs/stylex';

import {LumenButton} from '../../../design-system/primitives/LumenButton';
import {LumenIconButton} from '../../../design-system/primitives/LumenIconButton';
import {LumenText} from '../../../design-system/primitives/LumenText';
import {tokens} from '../../../design-system/tokens.stylex';
import type {IndexedRoot} from '../settings.schema';
import {ConfirmationDialog} from './ConfirmationDialog';
import {LumenSelect, LumenSwitch, LumenTextField} from './SettingsControls';
import {StatusBadge} from './StatusBadge';

const styles = stylex.create({
  root: {
    display: 'grid',
    gap: tokens.space8,
    padding: tokens.space8,
    borderBottomColor: tokens.colorBorderSubtle,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    ':last-child': {borderBottomWidth: 0},
  },
  top: {display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', alignItems: 'center', gap: tokens.space6},
  glyph: {
    width: '38px',
    height: '38px',
    display: 'grid',
    placeItems: 'center',
    color: tokens.colorAccent,
    backgroundColor: tokens.colorAccentMuted,
    borderRadius: tokens.radiusMedium,
  },
  path: {minWidth: 0, display: 'grid', gap: tokens.space2},
  truncate: {overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'},
  actions: {display: 'flex', alignItems: 'center', gap: tokens.space3},
  policies: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto auto',
    alignItems: 'center',
    gap: tokens.space5,
  },
  exclusions: {display: 'grid', gap: tokens.space4},
  addExclusion: {display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: tokens.space4},
  chips: {display: 'flex', flexWrap: 'wrap', gap: tokens.space3},
  chip: {
    minHeight: '26px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.space3,
    paddingInline: tokens.space5,
    color: tokens.colorTextSecondary,
    backgroundColor: tokens.colorMaterialRaised,
    borderRadius: tokens.radiusRound,
    fontFamily: tokens.fontFamilyText,
    fontSize: tokens.fontSizeMeta,
  },
  error: {color: tokens.colorError},
});

const rootStatus = {
  ready: {label: 'Ready', tone: 'success'},
  indexing: {label: 'Indexing', tone: 'info'},
  paused: {label: 'Paused', tone: 'warning'},
  error: {label: 'Needs attention', tone: 'error'},
} as const;

function validateExclusion(pattern: string) {
  const value = pattern.trim();
  if (!value || value.includes('..') || /^[a-z]:\\/i.test(value) || value.startsWith('\\\\')) {
    return 'Keep exclusions relative to this root and omit parent traversal.';
  }
  return '';
}

export interface IndexedRootRowProps {
  cloudEnrichment: boolean;
  cloudEnrichmentAvailable: boolean;
  root: IndexedRoot;
  onCloudEnrichmentChange(value: boolean): void;
  onChange(root: IndexedRoot): void;
  onRemove(): void;
}

export function IndexedRootRow({cloudEnrichment, cloudEnrichmentAvailable, root, onChange, onCloudEnrichmentChange, onRemove}: IndexedRootRowProps) {
  const [pattern, setPattern] = useState('');
  const [error, setError] = useState('');
  const status = rootStatus[root.status];

  const addExclusion = () => {
    const nextError = validateExclusion(pattern);
    setError(nextError);
    if (nextError) {
      return;
    }
    const value = pattern.trim();
    if (!root.exclusions.includes(value)) {
      onChange({...root, exclusions: [...root.exclusions, value]});
    }
    setPattern('');
  };

  const togglePaused = () => onChange({
    ...root,
    paused: !root.paused,
    status: root.paused ? 'ready' : 'paused',
  });

  return (
    <article aria-label={`Indexed root ${root.path}`} {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.top)}>
        <span aria-hidden="true" {...stylex.props(styles.glyph)}><FolderSimpleIcon size={21} weight="duotone" /></span>
        <div {...stylex.props(styles.path)}>
          <LumenText className={stylex.props(styles.truncate).className} weight="medium">{root.path}</LumenText>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </div>
        <div {...stylex.props(styles.actions)}>
          <LumenIconButton
            aria-label={`${root.paused ? 'Resume' : 'Pause'} ${root.path}`}
            size="small"
            variant="quiet"
            onPress={togglePaused}
          >
            {root.paused ? <PlayIcon aria-hidden="true" size={15} /> : <PauseIcon aria-hidden="true" size={15} />}
          </LumenIconButton>
          <ConfirmationDialog
            confirmLabel="Remove root permanently"
            description={`Lumen will stop searching ${root.path}. No files will be deleted.`}
            title="Remove indexed root"
            onConfirm={onRemove}
          >
            <LumenIconButton aria-label={`Remove ${root.path}`} size="small" variant="quiet">
              <TrashIcon aria-hidden="true" size={15} />
            </LumenIconButton>
          </ConfirmationDialog>
        </div>
      </div>
      <div {...stylex.props(styles.policies)}>
        <LumenText tone="tertiary" variant="meta">Root policy</LumenText>
        <LumenSwitch
          aria-label={`Allow cloud enrichment for ${root.path}`}
          isDisabled={!cloudEnrichmentAvailable}
          isSelected={cloudEnrichment}
          onChange={onCloudEnrichmentChange}
        />
        <LumenSwitch
          aria-label={`Include hidden directories for ${root.path}`}
          isSelected={root.includeHidden}
          onChange={(includeHidden) => onChange({...root, includeHidden})}
        />
        <LumenSelect
          aria-label={`File size limit for ${root.path}`}
          options={[
            {id: '64', label: '64 MB'},
            {id: '256', label: '256 MB'},
            {id: '1024', label: '1 GB'},
          ]}
          value={String(root.maxFileSizeMb) as '64' | '256' | '1024'}
          onChange={(value) => onChange({...root, maxFileSizeMb: Number(value)})}
        />
      </div>
      <div {...stylex.props(styles.exclusions)}>
        <div {...stylex.props(styles.addExclusion)}>
          <LumenTextField
            aria-label={`Exclusion pattern for ${root.path}`}
            placeholder="Examples: node_modules or *.tmp"
            value={pattern}
            onChange={(value) => {
              setPattern(value);
              if (error) setError('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addExclusion();
              }
            }}
          />
          <LumenButton aria-label={`Add exclusion for ${root.path}`} size="small" onPress={addExclusion}>Add</LumenButton>
        </div>
        {error ? <LumenText className={stylex.props(styles.error).className} role="alert" variant="meta">{error}</LumenText> : null}
        {root.exclusions.length ? (
          <div aria-label={`Exclusions for ${root.path}`} {...stylex.props(styles.chips)}>
            {root.exclusions.map((exclusion) => (
              <span key={exclusion} {...stylex.props(styles.chip)}>
                {exclusion}
                <LumenIconButton
                  aria-label={`Remove exclusion ${exclusion}`}
                  size="small"
                  variant="quiet"
                  onPress={() => onChange({...root, exclusions: root.exclusions.filter((item) => item !== exclusion)})}
                >
                  <XIcon aria-hidden="true" size={11} />
                </LumenIconButton>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
