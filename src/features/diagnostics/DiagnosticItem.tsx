import type {ReactNode} from 'react';

import * as stylex from '@stylexjs/stylex';

import {LumenText} from '../../design-system/primitives/LumenText';
import {tokens} from '../../design-system/tokens.stylex';

const styles = stylex.create({
  item: {
    minHeight: '48px',
    display: 'grid',
    gridTemplateColumns: 'minmax(120px, 0.65fr) minmax(0, 1fr)',
    alignItems: 'center',
    gap: tokens.space8,
    paddingBlock: tokens.space5,
    paddingInline: tokens.space8,
    borderBottomColor: tokens.colorBorderSubtle,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    ':last-child': {borderBottomWidth: 0},
  },
  value: {minWidth: 0, overflowWrap: 'anywhere'},
});

export function DiagnosticItem({label, children}: {label: string; children: ReactNode}) {
  return (
    <div {...stylex.props(styles.item)}>
      <LumenText tone="tertiary" variant="meta">{label}</LumenText>
      <LumenText className={stylex.props(styles.value).className} variant="meta" weight="medium">{children}</LumenText>
    </div>
  );
}
