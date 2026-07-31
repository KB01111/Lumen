import {useEffect, useRef} from 'react';

import {MicrophoneIcon} from '@phosphor-icons/react';
import * as stylex from '@stylexjs/stylex';

import {LumenMark} from '../../design-system/icons/LumenMark';
import {LumenIconButton} from '../../design-system/primitives/LumenIconButton';
import {LumenSurface} from '../../design-system/primitives/LumenSurface';
import {tokens} from '../../design-system/tokens.stylex';
import {createWindowService} from '../../platform/window/tauri-window-service';
import type {WindowService} from '../../platform/window/window-service';
import {LauncherStatus} from './LauncherStatus';
import {useLauncherStore} from './launcher.store';
import {useQueryStore} from './query.store';
import {ScopeRail} from './ScopeRail';
import {SearchInput} from './SearchInput';

const defaultWindowService = createWindowService();

const styles = stylex.create({
  shell: {
    width: '100%',
    minWidth: 0,
    borderRadius: tokens.radiusLauncher,
    transitionDuration: tokens.durationExpand,
    transitionProperty: 'border-radius',
    transitionTimingFunction: tokens.easingStandard,
  },
  expanded: {
    borderRadius: tokens.radiusLarge,
  },
  row: {
    minWidth: 0,
    minHeight: '52px',
    display: 'flex',
    alignItems: 'center',
    gap: tokens.space6,
    paddingInline: tokens.space6,
  },
  markWell: {
    width: '38px',
    height: '38px',
    display: 'grid',
    flexShrink: 0,
    placeItems: 'center',
    color: tokens.colorAccent,
    backgroundColor: tokens.colorAccentMuted,
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusMedium,
    boxShadow: tokens.shadowInsetTop,
  },
  mark: {
    filter: 'drop-shadow(0 0 10px currentColor)',
  },
  divider: {
    width: '1px',
    height: '26px',
    flexShrink: 0,
    backgroundColor: tokens.colorBorderSubtle,
  },
  voice: {
    flexShrink: 0,
    color: tokens.colorTextTertiary,
  },
  shortcut: {
    display: 'inline-flex',
    flexShrink: 0,
    paddingBlock: tokens.space2,
    paddingInline: tokens.space5,
    color: tokens.colorTextSecondary,
    backgroundColor: tokens.colorMaterialInset,
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusSmall,
    boxShadow: tokens.shadowInsetBottom,
    fontFamily: tokens.fontFamilyText,
    fontSize: tokens.fontSizeCaption,
    lineHeight: tokens.lineHeightTight,
  },
});

export interface CollapsedLauncherProps {
  windowService?: WindowService;
  onVoiceRequest?: () => void;
}

export function CollapsedLauncher({
  windowService = defaultWindowService,
  onVoiceRequest,
}: CollapsedLauncherProps) {
  const committedQuery = useQueryStore((state) => state.committed);
  const mode = useLauncherStore((state) => state.mode);
  const show = useLauncherStore((state) => state.show);
  const hide = useLauncherStore((state) => state.hide);
  const inputRef = useRef<HTMLInputElement>(null);
  const expanded = mode === 'expanded';

  useEffect(() => {
    if (committedQuery) {
      show('expanded');
      void windowService.show('expanded');
    } else if (mode === 'expanded') {
      show('collapsed');
      void windowService.show('collapsed');
    }
  }, [committedQuery, mode, show, windowService]);

  const handleEscapeEmpty = () => {
    hide();
    void windowService.hide();
  };

  return (
    <LumenSurface
      aria-label="Lumen launcher"
      className={stylex.props(styles.shell, expanded && styles.expanded).className}
      material="mica"
    >
      <div data-tauri-drag-region {...stylex.props(styles.row)}>
        <span aria-hidden="true" {...stylex.props(styles.markWell)}>
          <LumenMark className={stylex.props(styles.mark).className} size="large" />
        </span>
        <span aria-hidden="true" {...stylex.props(styles.divider)} />
        <SearchInput ref={inputRef} onEscapeEmpty={handleEscapeEmpty} />
        {onVoiceRequest ? (
          <LumenIconButton
            aria-label="Start voice input"
            className={stylex.props(styles.voice).className}
            size="small"
            variant="quiet"
            onPress={onVoiceRequest}
          >
            <MicrophoneIcon aria-hidden="true" size={15} />
          </LumenIconButton>
        ) : null}
        <LauncherStatus />
        <kbd aria-label="Alt plus Space" {...stylex.props(styles.shortcut)}>
          Alt&nbsp;&nbsp;Space
        </kbd>
      </div>
      {expanded ? <ScopeRail /> : null}
    </LumenSurface>
  );
}
