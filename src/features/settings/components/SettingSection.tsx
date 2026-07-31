import type {PropsWithChildren, ReactNode} from 'react';

import * as stylex from '@stylexjs/stylex';

import {LumenText} from '../../../design-system/primitives/LumenText';
import {tokens} from '../../../design-system/tokens.stylex';

const styles = stylex.create({
  section: {
    display: 'grid',
    gap: tokens.space6,
  },
  heading: {
    display: 'grid',
    gap: tokens.space2,
    paddingInline: tokens.space3,
  },
  body: {
    overflow: 'hidden',
    backgroundColor: tokens.colorMaterialInset,
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusLarge,
    boxShadow: tokens.shadowInsetTop,
  },
});

export interface SettingSectionProps extends PropsWithChildren {
  description?: ReactNode;
  title: string;
}

export function SettingSection({children, description, title}: SettingSectionProps) {
  const sectionId = `setting-section-${title.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <section aria-labelledby={sectionId} {...stylex.props(styles.section)}>
      <div {...stylex.props(styles.heading)}>
        <LumenText
          as="h2"
          id={sectionId}
          variant="bodyLarge"
          weight="semibold"
        >
          {title}
        </LumenText>
        {description ? <LumenText tone="tertiary" variant="meta">{description}</LumenText> : null}
      </div>
      <div {...stylex.props(styles.body)}>{children}</div>
    </section>
  );
}
