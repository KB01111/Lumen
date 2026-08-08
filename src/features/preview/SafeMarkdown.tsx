import {Fragment, type ReactNode} from 'react';

const inlinePattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

function isSafeLink(value: string) {
  if (/^(?:\/|\.\/|\.\.\/)/.test(value)) return true;
  try {
    return ['https:', 'http:', 'mailto:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function inlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  return text.split(inlinePattern).filter(Boolean).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={key}>{part.slice(1, -1)}</em>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={key} className="rounded bg-[var(--einui-command-row)] px-1 py-0.5 font-mono text-xs text-[color:var(--einui-command-text)]">{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const [, label, href] = link;
      return isSafeLink(href) ? <a key={key} className="text-accent underline decoration-[color:var(--lumen-focus)] underline-offset-3" href={href} rel="noreferrer" target="_blank">{label}</a> : <span key={key}>{label}</span>;
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

interface MarkdownBlock { content: string | string[]; language?: string; type: 'heading1' | 'heading2' | 'heading3' | 'paragraph' | 'list' | 'code'; }

function parseBlocks(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (!line.trim()) { index += 1; continue; }
    if (line.startsWith('```')) {
      const language = line.slice(3).trim(); const code: string[] = []; index += 1;
      while (index < lines.length && !lines[index]?.startsWith('```')) { code.push(lines[index] ?? ''); index += 1; }
      index += index < lines.length ? 1 : 0; blocks.push({content: code.join('\n'), language, type: 'code'}); continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) { blocks.push({content: heading[2] ?? '', type: `heading${heading[1]?.length ?? 1}` as MarkdownBlock['type']}); index += 1; continue; }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index] ?? '')) { items.push((lines[index] ?? '').replace(/^\s*[-*]\s+/, '')); index += 1; }
      blocks.push({content: items, type: 'list'}); continue;
    }
    const paragraph = [line.trim()]; index += 1;
    while (index < lines.length && lines[index]?.trim() && !/^(?:#{1,3}\s|```|\s*[-*]\s+)/.test(lines[index] ?? '')) { paragraph.push(lines[index]?.trim() ?? ''); index += 1; }
    blocks.push({content: paragraph.join(' '), type: 'paragraph'});
  }
  return blocks;
}

export function SafeMarkdown({source}: {source: string}) {
  return <div className="grid gap-3 break-words font-sans text-sm leading-relaxed text-text-secondary">
    {parseBlocks(source).map((block, index) => {
      const key = `${block.type}-${index}`;
      if (block.type === 'code') return <pre key={key} className="m-0 overflow-x-auto rounded-control border border-[color:var(--einui-command-divider)] bg-[var(--lumen-surface-inset)] p-3 font-mono text-xs leading-relaxed text-[color:var(--einui-command-text)] whitespace-pre-wrap" data-language={block.language}><code>{block.content}</code></pre>;
      if (block.type === 'list') return <ul key={key} className="grid list-disc gap-1 pl-6">{(block.content as string[]).map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{inlineMarkdown(item, `${key}-${itemIndex}`)}</li>)}</ul>;
      if (block.type.startsWith('heading')) {
        const level = Number(block.type.slice(-1)) as 1 | 2 | 3;
        const Heading = `h${level}` as const;
        const sizes = {1: 'text-2xl', 2: 'text-[1.1875rem]', 3: 'text-[0.9375rem]'} as const;
        return <Heading key={key} className={`my-1 font-display font-semibold leading-tight tracking-tight text-[color:var(--einui-command-text)] ${sizes[level]}`}>{inlineMarkdown(block.content as string, key)}</Heading>;
      }
      return <p key={key} className="m-0">{inlineMarkdown(block.content as string, key)}</p>;
    })}
  </div>;
}
