import {useEffect, useState} from 'react';

import * as stylex from '@stylexjs/stylex';

import {LumenMark} from '../design-system/icons/LumenMark';
import {LumenSurface} from '../design-system/primitives/LumenSurface';
import {LumenText} from '../design-system/primitives/LumenText';
import type {AppearancePreferences} from '../design-system/themes.stylex';
import {tokens} from '../design-system/tokens.stylex';
import {CollapsedLauncher} from '../features/launcher/CollapsedLauncher';
import {AppProviders} from './AppProviders';

const styles = stylex.create({
  stage: {
    width: '100%',
    height: '100%',
    display: 'grid',
    alignItems: 'stretch',
    padding: tokens.space3,
    backgroundColor: 'transparent',
  },
  shell: {
    width: '100%',
    height: '100%',
    borderRadius: tokens.radiusLauncher,
  },
  launcher: {
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
  prompt: {
    minWidth: 0,
    display: 'flex',
    flex: 1,
    alignItems: 'baseline',
    gap: tokens.space4,
    overflow: 'hidden',
  },
  promptText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  status: {
    display: 'inline-flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: tokens.space3,
    color: tokens.colorTextTertiary,
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: tokens.radiusRound,
    backgroundColor: tokens.colorSuccess,
    boxShadow: `0 0 9px ${tokens.colorSuccess}`,
  },
  shortcut: {
    display: 'inline-flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: tokens.space2,
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

const foundationAppearances: AppearancePreferences[] = [
  {mode: 'dark', transparency: 'native', effects: 'full', motion: 'full'},
  {mode: 'light', transparency: 'native', effects: 'full', motion: 'full'},
  {mode: 'dark', transparency: 'disabled', effects: 'reduced', motion: 'reduced'},
];

function isFoundationPreview() {
  return import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get('mode') === 'foundation';
}

export function App() {
  const foundationPreview = isFoundationPreview();
  const [foundationAppearance, setFoundationAppearance] = useState(0);

  useEffect(() => {
    if (!foundationPreview) {
      return;
    }

    const cycleFoundationAppearance = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        setFoundationAppearance((current) =>
          (current + 1) % foundationAppearances.length,
        );
      }
    };

    window.addEventListener('keydown', cycleFoundationAppearance);
    return () => window.removeEventListener('keydown', cycleFoundationAppearance);
  }, [foundationPreview]);

  return (
    <AppProviders
      appearance={foundationPreview
        ? foundationAppearances[foundationAppearance]
        : undefined}
    >
      <main {...stylex.props(styles.stage)}>
        {foundationPreview ? (
          <LumenSurface
            aria-label="Lumen launcher"
            className={stylex.props(styles.shell).className}
            material="mica"
          >
            <div data-tauri-drag-region {...stylex.props(styles.launcher)}>
              <span aria-hidden="true" {...stylex.props(styles.markWell)}>
                <LumenMark
                  className={stylex.props(styles.mark).className}
                  size="large"
                />
              </span>
              <span aria-hidden="true" {...stylex.props(styles.divider)} />
              <div {...stylex.props(styles.prompt)}>
                <LumenText
                  className={stylex.props(styles.promptText).className}
                  tone="secondary"
                  variant="bodyLarge"
                >
                  Search apps, files, and settings
                </LumenText>
                <LumenText tone="tertiary" variant="caption">
                  Local
                </LumenText>
              </div>
              <span aria-label="Local search ready" {...stylex.props(styles.status)}>
                <span aria-hidden="true" {...stylex.props(styles.statusDot)} />
                <LumenText tone="tertiary" variant="caption">
                  Ready
                </LumenText>
              </span>
              <kbd aria-label="Alt plus Space" {...stylex.props(styles.shortcut)}>
                Alt&nbsp;&nbsp;Space
              </kbd>
            </div>
          </LumenSurface>
        ) : (
          <CollapsedLauncher />
        )}
      </main>
    </AppProviders>
  );
}
