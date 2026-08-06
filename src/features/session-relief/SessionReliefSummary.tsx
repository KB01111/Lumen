import * as stylex from '@stylexjs/stylex';

import type {SessionReliefReport} from '../../services/session-relief/session-relief.schema';
import {LumenText} from '../../design-system/primitives/LumenText';
import {tokens} from '../../design-system/tokens.stylex';
import {SettingSection} from '../settings/components/SettingSection';
import {formatSessionReliefAge, formatSessionReliefBytes, formatSessionReliefCount, formatSessionReliefPercent} from './session-relief-format';

const styles = stylex.create({
  evidence: {display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: tokens.space6, padding: tokens.space8},
  item: {display: 'grid', gap: tokens.space2, minWidth: 0},
  label: {color: tokens.colorTextTertiary, fontSize: tokens.fontSizeMeta},
  value: {fontWeight: tokens.fontWeightSemibold, overflowWrap: 'anywhere'},
  findings: {display: 'grid', gap: tokens.space6, padding: tokens.space8},
  finding: {display: 'grid', gap: tokens.space2, padding: tokens.space6, backgroundColor: tokens.colorMaterialRaised, borderRadius: tokens.radiusMedium},
});

function Evidence({label, value}: {label: string; value: string}) {
  return <div {...stylex.props(styles.item)}><dt className={stylex.props(styles.label).className}>{label}</dt><dd className={stylex.props(styles.value).className}>{value}</dd></div>;
}

export function SessionReliefSummary({report}: {report: SessionReliefReport}) {
  const {system} = report;
  return (
    <>
      <SettingSection title="Current session evidence" description="A short, on-demand sample of local system pressure.">
        <dl {...stylex.props(styles.evidence)}>
          <Evidence label="Pressure" value={system.pressure} />
          <Evidence label="Memory used" value={formatSessionReliefBytes(system.memoryUsedBytes)} />
          <Evidence label="Memory available" value={formatSessionReliefBytes(system.memoryAvailableBytes)} />
          {system.commitUsedBytes != null ? <Evidence label="Commit used" value={formatSessionReliefBytes(system.commitUsedBytes)} /> : null}
          {system.commitLimitBytes != null ? <Evidence label="Commit limit" value={formatSessionReliefBytes(system.commitLimitBytes)} /> : null}
          <Evidence label="Processes" value={formatSessionReliefCount(system.processCount)} />
          <Evidence label="Session uptime" value={formatSessionReliefAge(system.uptimeSeconds)} />
          <Evidence label="Sampled CPU" value={formatSessionReliefPercent(system.sampledCpuPercent)} />
          {system.systemDriveFreeBytes != null ? <Evidence label="System drive free" value={formatSessionReliefBytes(system.systemDriveFreeBytes)} /> : null}
        </dl>
      </SettingSection>
      {report.findings.length > 0 ? <SettingSection title="Noteworthy findings">
        <div {...stylex.props(styles.findings)}>
          {report.findings.map((finding) => <article key={`${finding.code}-${finding.title}`} {...stylex.props(styles.finding)}>
            <LumenText as="h3" weight="semibold">{finding.severity}: {finding.title}</LumenText>
            <LumenText tone="secondary" variant="meta">{finding.evidence}</LumenText>
            <LumenText tone="tertiary" variant="meta">{finding.guidance}</LumenText>
          </article>)}
        </div>
      </SettingSection> : null}
    </>
  );
}
