import * as stylex from '@stylexjs/stylex';

import type {SessionReliefReport} from '../../services/session-relief/session-relief.schema';
import {LumenText} from '../../design-system/primitives/LumenText';
import {tokens} from '../../design-system/tokens.stylex';
import {SettingSection} from '../settings/components/SettingSection';
import {formatSessionReliefAge, formatSessionReliefBytes, formatSessionReliefCount, formatSessionReliefPercent} from './session-relief-format';

const styles = stylex.create({
  list: {display: 'grid'},
  row: {display: 'grid', gap: tokens.space3, padding: tokens.space8, borderBottomColor: tokens.colorBorderSubtle, borderBottomStyle: 'solid', borderBottomWidth: '1px', ':last-child': {borderBottomWidth: 0}},
  details: {display: 'flex', flexWrap: 'wrap', gap: tokens.space5},
});

export function ProcessFamilyList({families}: {families: SessionReliefReport['families']}) {
  return (
    <SettingSection title="Process families" description="Related executable basenames, ranked by current pressure and resident memory.">
      <div {...stylex.props(styles.list)}>
        {families.map((family) => <article key={family.name} {...stylex.props(styles.row)}>
          <LumenText as="h3" weight="semibold">{family.name} · {family.category} · {family.pressure}</LumenText>
          <LumenText tone="secondary" variant="meta" className={stylex.props(styles.details).className}>
            {formatSessionReliefCount(family.processCount)} processes · {formatSessionReliefBytes(family.totalMemoryBytes)} resident · {formatSessionReliefPercent(family.totalCpuPercent)} CPU · oldest {formatSessionReliefAge(family.oldestAgeSeconds)} · {formatSessionReliefCount(family.rootCount)} roots · {formatSessionReliefCount(family.detachedCount)} detached · signal {family.signal}
          </LumenText>
        </article>)}
      </div>
    </SettingSection>
  );
}
