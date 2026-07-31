import {useEffect} from 'react';

import {ArrowClockwiseIcon, XIcon} from '@phosphor-icons/react';
import * as stylex from '@stylexjs/stylex';

import {LumenIconButton} from '../../design-system/primitives/LumenIconButton';
import {LumenText} from '../../design-system/primitives/LumenText';
import {tokens} from '../../design-system/tokens.stylex';
import {DiagnosticItem} from './DiagnosticItem';
import {useDiagnosticsStore} from './diagnostics.store';

const styles = stylex.create({
  overlay: {
    position: 'fixed',
    top: tokens.space8,
    right: tokens.space8,
    zIndex: 50,
    width: 'min(340px, calc(100vw - 32px))',
    maxHeight: 'calc(100vh - 32px)',
    overflowY: 'auto',
    color: tokens.colorTextPrimary,
    backgroundColor: tokens.colorCanvasElevated,
    borderColor: tokens.colorBorderStrong,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusLarge,
    boxShadow: tokens.shadowAmbient,
  },
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    minHeight: '46px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.space6,
    paddingInline: tokens.space6,
    backgroundColor: tokens.colorCanvasElevated,
    borderBottomColor: tokens.colorBorderSubtle,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
  },
  actions: {display: 'flex', alignItems: 'center', gap: tokens.space2},
});

export function DiagnosticsOverlay() {
  const open = useDiagnosticsStore((state) => state.overlayOpen);
  const snapshot = useDiagnosticsStore((state) => state.snapshot);
  const refresh = useDiagnosticsStore((state) => state.refresh);
  const setOverlay = useDiagnosticsStore((state) => state.setOverlay);
  const toggleOverlay = useDiagnosticsStore((state) => state.toggleOverlay);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        toggleOverlay();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [toggleOverlay]);

  if (!open) return null;

  const latestInput = [...snapshot.timings].reverse().find((sample) => sample.name === 'input-paint');
  const latestSelection = [...snapshot.timings].reverse().find((sample) => sample.name === 'selection-paint');

  return (
    <aside aria-label="Performance diagnostics" {...stylex.props(styles.overlay)}>
      <div {...stylex.props(styles.header)}>
        <LumenText weight="semibold">Performance</LumenText>
        <div {...stylex.props(styles.actions)}>
          <LumenIconButton aria-label="Refresh diagnostics" size="small" variant="quiet" onPress={refresh}>
            <ArrowClockwiseIcon aria-hidden="true" size={14} />
          </LumenIconButton>
          <LumenIconButton aria-label="Close diagnostics" size="small" variant="quiet" onPress={() => setOverlay(false)}>
            <XIcon aria-hidden="true" size={14} />
          </LumenIconButton>
        </div>
      </div>
      <DiagnosticItem label="Refresh estimate">{snapshot.refreshRateHz} Hz</DiagnosticItem>
      <DiagnosticItem label="DPI scale">{Math.round(snapshot.dpiScale * 100)}%</DiagnosticItem>
      <DiagnosticItem label="React commit">{snapshot.reactCommitMs.toFixed(2)} ms</DiagnosticItem>
      <DiagnosticItem label="Input to paint">{latestInput ? `${latestInput.durationMs.toFixed(2)} ms` : 'Awaiting sample'}</DiagnosticItem>
      <DiagnosticItem label="Selection to paint">{latestSelection ? `${latestSelection.durationMs.toFixed(2)} ms` : 'Awaiting sample'}</DiagnosticItem>
      <DiagnosticItem label="Long tasks">{snapshot.longTasks.length}</DiagnosticItem>
      <DiagnosticItem label="Active animations">{snapshot.activeAnimations}</DiagnosticItem>
    </aside>
  );
}
