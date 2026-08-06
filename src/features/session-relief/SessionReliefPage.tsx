import {useState} from 'react';

import * as stylex from '@stylexjs/stylex';

import {LumenButton} from '../../design-system/primitives/LumenButton';
import {LumenText} from '../../design-system/primitives/LumenText';
import type {SessionReliefService} from '../../services/session-relief/session-relief-service';
import {defaultSessionReliefService} from '../../services/session-relief/default-session-relief-service';
import {tokens} from '../../design-system/tokens.stylex';
import {SettingSection} from '../settings/components/SettingSection';
import {SettingsCallout, SettingsPage} from '../settings/components/SettingsPage';
import {ProcessFamilyList} from './ProcessFamilyList';
import {ProcessTreeList} from './ProcessTreeList';
import {SessionReliefSummary} from './SessionReliefSummary';
import {createSafeSummary, formatSessionReliefCapturedAt, formatSessionReliefCount} from './session-relief-format';
import {useSessionReliefController} from './useSessionReliefController';

const styles = stylex.create({
  actions: {display: 'flex', flexWrap: 'wrap', gap: tokens.space4},
  reportMeta: {display: 'flex', flexWrap: 'wrap', gap: tokens.space5},
  warnings: {display: 'grid', gap: tokens.space4, padding: tokens.space8},
});

type CopyText = (text: string) => Promise<void>;

const defaultCopyText: CopyText = (text) => navigator.clipboard.writeText(text);

export interface SessionReliefPageProps {
  service?: SessionReliefService;
  copyText?: CopyText;
}

export function SessionReliefPage({service = defaultSessionReliefService, copyText = defaultCopyText}: SessionReliefPageProps) {
  const {status, report, error, analyze} = useSessionReliefController(service);
  const [copyError, setCopyError] = useState<string | null>(null);
  const collecting = status === 'collecting';
  const copy = async () => {
    if (!report) return;
    setCopyError(null);
    try {
      await copyText(createSafeSummary(report));
    } catch {
      setCopyError('Lumen could not copy the safe session summary.');
    }
  };

  return (
    <SettingsPage>
      <LumenText tone="secondary">All analysis stays on this device. Lumen samples local process pressure only when you ask and never changes process or file state.</LumenText>
      {collecting ? <div role="status" aria-live="polite"><LumenText tone="secondary">Sampling current CPU and memory use. This short, bounded sample replaces the report only when it succeeds.</LumenText></div> : null}
      {error ? <SettingsCallout tone="error">{error}</SettingsCallout> : null}
      {copyError ? <SettingsCallout tone="error">{copyError}</SettingsCallout> : null}
      {report ? <>
        <SettingSection title="Captured report">
          <div {...stylex.props(styles.warnings)}>
            <LumenText className={stylex.props(styles.reportMeta).className} tone="secondary" variant="meta">Captured {formatSessionReliefCapturedAt(report.capturedAt)} · {formatSessionReliefCount(report.collectionDurationMs)} ms collection</LumenText>
            <div {...stylex.props(styles.actions)}>
              <LumenButton isDisabled={collecting} size="small" onPress={() => void analyze()}>Refresh report</LumenButton>
              <LumenButton isDisabled={collecting} size="small" variant="quiet" onPress={() => void copy()}>Copy safe summary</LumenButton>
            </div>
          </div>
        </SettingSection>
        {status === 'partial' ? <SettingsCallout tone="warning">This report is partial; available sections remain usable.</SettingsCallout> : null}
        {report.warnings.length > 0 ? <SettingSection title="Collection limitations">
          <div {...stylex.props(styles.warnings)}>{report.warnings.map((warning) => <LumenText key={warning.code} tone="secondary" variant="meta">{warning.message}</LumenText>)}</div>
        </SettingSection> : null}
        <SessionReliefSummary report={report} />
        <ProcessFamilyList families={report.families} />
        <ProcessTreeList trees={report.trees} />
      </> : <SettingSection title="Analyze this session" description="Inspect current pressure, retained process families, and local-only process trees.">
        <div {...stylex.props(styles.warnings)}>
          <LumenText tone="secondary">The report is on demand, read only, and kept in memory only while Lumen is running.</LumenText>
          <div {...stylex.props(styles.actions)}>
            <LumenButton isDisabled={collecting} variant="primary" onPress={() => void analyze()}>{status === 'error' ? 'Try again' : 'Analyze this session'}</LumenButton>
          </div>
        </div>
      </SettingSection>}
    </SettingsPage>
  );
}
