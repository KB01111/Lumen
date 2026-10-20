import {writeFile} from 'node:fs/promises';
import {defineTheme, generateThemeCSS} from '@astryxdesign/core/theme';

// Public token names keep the precompiled component styles tied to Lumen's live appearance.
const theme = defineTheme({
  name: 'lumen-agent',
  tokens: {
    '--color-accent': 'var(--lumen-accent)',
    '--color-text-primary': 'var(--lumen-text-primary)',
    '--color-text-secondary': 'var(--lumen-text-secondary)',
    '--color-text-disabled': 'var(--lumen-text-tertiary)',
    '--color-icon-primary': 'var(--lumen-text-primary)',
    '--color-icon-secondary': 'var(--lumen-text-secondary)',
    '--color-icon-disabled': 'var(--lumen-text-tertiary)',
    '--color-icon-accent': 'var(--lumen-accent)',
    '--color-on-accent': 'var(--lumen-text-inverse)',
    '--color-background-body': 'var(--lumen-canvas)',
    '--color-background-surface': 'var(--lumen-surface-raised)',
    '--color-background-muted': 'var(--lumen-surface-inset)',
    '--color-overlay-hover': 'var(--lumen-surface-inset)',
    '--color-border': 'var(--lumen-border-subtle)',
    '--color-success': 'var(--lumen-success)',
    '--color-error': 'var(--lumen-danger)',
    '--color-warning': 'var(--lumen-warning)',
    '--focus-outline-color': 'var(--lumen-focus)',
    '--font-family-body': '"Segoe UI Variable Text", "Segoe UI", sans-serif',
    '--font-family-heading': '"Segoe UI Variable Display", "Segoe UI", sans-serif',
    '--font-family-code': '"Segoe UI Variable Text", "Segoe UI", sans-serif',
    '--text-supporting-size': '0.75rem',
    '--text-supporting-leading': '1.45',
    '--radius-element': 'var(--lumen-radius-control)',
    '--radius-container': 'var(--lumen-radius-surface)',
    '--duration-fast': 'var(--lumen-duration-hover)',
    '--duration-medium': 'var(--lumen-duration-selection)',
  },
});

const warnings = [];
const {component} = generateThemeCSS(theme, warnings);
if (warnings.length > 0) throw new Error(warnings.join('\n'));

const css = `/* Generated with @astryxdesign/core 0.7.1. Regenerate: rtk proxy bun scripts/generate-astryx-theme.mjs */
@layer astryx-theme {
${component}
}

/* Session progress is static, including when hidden or Lumen reduces motion. */
.lumen-agent-activity,
.lumen-agent-activity :where(*) {
  animation: none;
  transition: none;
}
`;

await writeFile(new URL('../src/design-system/integrations/astryx/theme.css', import.meta.url), css, 'utf8');
