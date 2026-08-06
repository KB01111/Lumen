import type {SessionReliefReport} from '../../services/session-relief/session-relief.schema';

export function formatSessionReliefBytes(value: number): string {
  return new Intl.NumberFormat(undefined, {style: 'unit', unit: 'byte', notation: 'compact', maximumFractionDigits: 1}).format(value);
}

export function formatSessionReliefPercent(value: number): string {
  return new Intl.NumberFormat(undefined, {style: 'percent', maximumFractionDigits: 1}).format(value / 100);
}

export function formatSessionReliefCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

export function formatSessionReliefAge(seconds: number): string {
  if (seconds < 60) return `${formatSessionReliefCount(seconds)} seconds`;
  if (seconds < 3_600) return `${formatSessionReliefCount(Math.floor(seconds / 60))} minutes`;
  return `${formatSessionReliefCount(Math.floor(seconds / 3_600))} hours`;
}

export function formatSessionReliefCapturedAt(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {dateStyle: 'medium', timeStyle: 'medium'}).format(timestamp);
}

export function createSafeSummary(report: SessionReliefReport): string {
  const safe = {
    schemaVersion: report.schemaVersion,
    capturedAt: report.capturedAt,
    collectionDurationMs: report.collectionDurationMs,
    system: report.system,
    families: report.families.map((family) => {
      const {name, ...aggregate} = family;
      void name;
      return aggregate;
    }),
    findings: report.findings.map((finding) => {
      const {evidence, ...shareable} = finding;
      void evidence;
      return shareable;
    }),
    coverage: report.coverage,
    warnings: report.warnings,
  };
  return JSON.stringify(safe, null, 2);
}
