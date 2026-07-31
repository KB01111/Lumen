import {Fragment, type ReactNode} from 'react';

import * as stylex from '@stylexjs/stylex';

import {tokens} from '../../design-system/tokens.stylex';

const styles = stylex.create({
  root: {
    display: 'grid',
    gap: tokens.space8,
    color: tokens.colorTextSecondary,
    fontFamily: tokens.fontFamilyText,
    fontSize: tokens.fontSizeBody,
    lineHeight: tokens.lineHeightRelaxed,
    overflowWrap: 'anywhere',
  },
  heading: {
    marginBlock: tokens.space4,
    color: tokens.colorTextPrimary,
    fontFamily: tokens.fontFamilyDisplay,
    fontWeight: tokens.fontWeightSemibold,
    letterSpacing: tokens.letterSpacingTight,
    lineHeight: tokens.lineHeightTight,
  },
  heading1: {fontSize: '24px'},
  heading2: {fontSize: '19px'},
  heading3: {fontSize: tokens.fontSizeBodyLarge},
  paragraph: {margin: 0},
  list: {
    display: 'grid',
    gap: tokens.space3,
    margin: 0,
    paddingInlineStart: tokens.space12,
  },
  link: {
    color: tokens.colorAccent,
    textDecorationColor: tokens.colorFocusSoft,
    textDecorationLine: 'underline',
    textUnderlineOffset: '3px',
  },
  code: {
    paddingBlock: tokens.space1,
    paddingInline: tokens.space3,
    color: tokens.colorTextPrimary,
    backgroundColor: tokens.colorMaterialInset,
    borderRadius: tokens.radiusSmall,
    fontFamily: '"Cascadia Code", Consolas, monospace',
    fontSize: tokens.fontSizeMeta,
  },
  codeBlock: {
    margin: 0,
    padding: tokens.space8,
    overflowX: 'auto',
    color: tokens.colorTextPrimary,
    backgroundColor: tokens.colorMaterialInset,
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusMedium,
    fontFamily: '"Cascadia Code", Consolas, monospace',
    fontSize: tokens.fontSizeMeta,
    lineHeight: tokens.lineHeightRelaxed,
    whiteSpace: 'pre-wrap',
  },
});

const inlinePattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

function isSafeLink(value: string) {
  if (/^(?:\/|\.\/|\.\.\/)/.test(value)) {
    return true;
  }
  try {
    return ['https:', 'http:', 'mailto:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function inlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  return text.split(inlinePattern).filter(Boolean).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={key} {...stylex.props(styles.code)}>{part.slice(1, -1)}</code>;
    }
    const link = part.match(/^\[([^\]]+)]\(([^)]+)\)$/);
    if (link) {
      const [, label, href] = link;
      return isSafeLink(href) ? (
        <a
          key={key}
          {...stylex.props(styles.link)}
          href={href}
          rel="noreferrer"
          target="_blank"
        >
          {label}
        </a>
      ) : <span key={key}>{label}</span>;
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

interface MarkdownBlock {
  content: string | string[];
  language?: string;
  type: 'heading1' | 'heading2' | 'heading3' | 'paragraph' | 'list' | 'code';
}

function parseBlocks(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line.startsWith('```')) {
      const language = line.slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index]?.startsWith('```')) {
        code.push(lines[index] ?? '');
        index += 1;
      }
      index += index < lines.length ? 1 : 0;
      blocks.push({content: code.join('\n'), language, type: 'code'});
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({
        content: heading[2] ?? '',
        type: `heading${heading[1]?.length ?? 1}` as MarkdownBlock['type'],
      });
      index += 1;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^\s*[-*]\s+/, ''));
        index += 1;
      }
      blocks.push({content: items, type: 'list'});
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      lines[index]?.trim() &&
      !/^(?:#{1,3}\s|```|\s*[-*]\s+)/.test(lines[index] ?? '')
    ) {
      paragraph.push(lines[index]?.trim() ?? '');
      index += 1;
    }
    blocks.push({content: paragraph.join(' '), type: 'paragraph'});
  }

  return blocks;
}

export function SafeMarkdown({source}: {source: string}) {
  return (
    <div {...stylex.props(styles.root)}>
      {parseBlocks(source).map((block, index) => {
        const key = `${block.type}-${index}`;
        if (block.type === 'code') {
          return (
            <pre key={key} {...stylex.props(styles.codeBlock)} data-language={block.language}>
              <code>{block.content}</code>
            </pre>
          );
        }
        if (block.type === 'list') {
          return (
            <ul key={key} {...stylex.props(styles.list)}>
              {(block.content as string[]).map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{inlineMarkdown(item, `${key}-${itemIndex}`)}</li>
              ))}
            </ul>
          );
        }
        if (block.type.startsWith('heading')) {
          const level = Number(block.type.slice(-1)) as 1 | 2 | 3;
          const Heading = `h${level}` as const;
          return (
            <Heading
              key={key}
              {...stylex.props(styles.heading, styles[block.type])}
            >
              {inlineMarkdown(block.content as string, key)}
            </Heading>
          );
        }
        return (
          <p key={key} {...stylex.props(styles.paragraph)}>
            {inlineMarkdown(block.content as string, key)}
          </p>
        );
      })}
    </div>
  );
}
