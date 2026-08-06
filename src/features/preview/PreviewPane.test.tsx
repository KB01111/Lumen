import {act, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {createRef, useState} from 'react';
import {describe, expect, it, vi} from 'vitest';

import {MemorySearchService} from '../../services/search/memory-search-service';
import type {FilePreview, PreviewKind} from '../../services/search/search.types';
import {PreviewPane} from './PreviewPane';

function preview(
  fileId: string,
  kind: PreviewKind,
  overrides: Partial<FilePreview> = {},
): FilePreview {
  return {
    fileId,
    kind,
    title: `${kind} sample`,
    subtitle: `C:\\Lumen\\${fileId}`,
    metadata: {Type: kind},
    ...overrides,
  };
}

describe('PreviewPane', () => {
  it('aborts the previous request and ignores a slow preview after selection changes', async () => {
    const service = new MemorySearchService();
    const {rerender} = render(
      <PreviewPane fileId="a" reducedMotion service={service} />,
    );

    rerender(<PreviewPane fileId="b" reducedMotion service={service} />);
    expect(service.previewSignal('a')).toHaveProperty('aborted', true);

    await act(() =>
      service.resolvePreview('b', preview('b', 'text', {text: 'current preview'})),
    );
    await act(() =>
      service.resolvePreview('a', preview('a', 'text', {text: 'stale preview'})),
    );

    expect(await screen.findByText('current preview')).toBeVisible();
    expect(screen.queryByText('stale preview')).not.toBeInTheDocument();
  });

  it('renders supported Markdown without executing raw HTML or unsafe links', async () => {
    const service = new MemorySearchService();
    const {container} = render(
      <PreviewPane fileId="markdown" reducedMotion service={service} />,
    );

    await act(() =>
      service.resolvePreview(
        'markdown',
        preview('markdown', 'markdown', {
          text: [
            '# Release notes',
            '',
            '**Fast** local search with [documentation](https://example.com).',
            '',
            '[Unsafe action](javascript:alert(1))',
            '',
            '<script>window.compromised = true</script>',
            '',
            '- Keyboard first',
            '- Private by default',
            '',
            '```ts',
            'const safe = true;',
            '```',
          ].join('\n'),
        }),
      ),
    );

    expect(await screen.findByRole('heading', {name: 'Release notes'})).toBeVisible();
    expect(screen.getByText('Fast', {selector: 'strong'})).toBeVisible();
    expect(screen.getByRole('link', {name: 'documentation'})).toHaveAttribute(
      'href',
      'https://example.com',
    );
    expect(screen.getByText('Unsafe action')).not.toHaveAttribute('href');
    expect(screen.getByText(/<script>window\.compromised/)).toBeVisible();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('[href^="javascript:"]')).toBeNull();
    expect(screen.getByText('const safe = true;')).toBeVisible();
  });

  const categoryCases: ReadonlyArray<{
    kind: PreviewKind;
    overrides?: Partial<FilePreview>;
    expected: RegExp;
  }> = [
    {
      kind: 'folder',
      overrides: {children: [{id: 'child', name: 'Child file.txt', kind: 'document'}]},
      expected: /Child file\.txt/i,
    },
    {kind: 'text', overrides: {text: 'Plain text preview'}, expected: /Plain text preview/i},
    {kind: 'source', overrides: {text: 'export const lumen = true;'}, expected: /export const lumen/i},
    {kind: 'markdown', overrides: {text: '# Markdown preview'}, expected: /Markdown preview/i},
    {kind: 'pdf', expected: /PDF document/i},
    {kind: 'document', expected: /Document preview/i},
    {kind: 'presentation', expected: /Presentation preview/i},
    {
      kind: 'spreadsheet',
      overrides: {columns: ['Name', 'Value'], rows: [['Lumen', 'Ready']]},
      expected: /Ready/i,
    },
    {
      kind: 'image',
      overrides: {sourceUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw='},
      expected: /image sample/i,
    },
    {kind: 'audio', expected: /Audio file/i},
    {kind: 'video', expected: /Video file/i},
    {kind: 'unsupported', expected: /Preview unavailable/i},
    {kind: 'permissionDenied', expected: /Permission required/i},
  ];

  it.each(categoryCases)('renders the $kind preview category', async ({kind, overrides, expected}) => {
    const service = new MemorySearchService();
    render(<PreviewPane fileId={kind} reducedMotion service={service} />);

    await act(() => service.resolvePreview(kind, preview(kind, kind, overrides)));

    expect(await screen.findByTestId(`preview-${kind}`)).toBeVisible();
    expect(screen.getByText(expected)).toBeVisible();
  });

  it('keeps failures inside the preview shell with a useful permission state', async () => {
    const service = new MemorySearchService();
    render(<PreviewPane fileId="blocked" reducedMotion service={service} />);

    await act(() =>
      service.rejectPreview('blocked', {
        code: 'permission-denied',
        message: 'Lumen cannot read this location.',
        recoverable: true,
      }),
    );

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Permission required')).toBeVisible();
    expect(within(alert).getByText('Lumen cannot read this location.')).toBeVisible();
  });

  it.each([
    {isOpen: true, mode: 'pane' as const},
    {isOpen: true, mode: 'dialog' as const},
  ])('does not request $mode previews while Privacy settings disable them', ({isOpen, mode}) => {
    const service = new MemorySearchService();
    render(<PreviewPane fileId="private" isOpen={isOpen} mode={mode} previewsEnabled={false} reducedMotion service={service} />);

    expect(screen.getByRole('alert')).toHaveTextContent('File previews disabled');
    expect(screen.getByRole('alert')).toHaveTextContent('File previews are disabled in Privacy settings.');
    expect(service.previewSignal('private')).toBeUndefined();
  });

  it('dismisses the narrow details dialog with Escape and restores focus', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const restoreFocusRef = createRef<HTMLButtonElement>();

    function Harness() {
      const [isOpen, setIsOpen] = useState(true);
      return (
        <>
          <button ref={restoreFocusRef} type="button">Result details</button>
          <PreviewPane
            fileId={null}
            isOpen={isOpen}
            mode="dialog"
            reducedMotion
            restoreFocusRef={restoreFocusRef}
            service={new MemorySearchService()}
            onOpenChange={(open) => {
              onOpenChange(open);
              setIsOpen(open);
            }}
          />
        </>
      );
    }

    render(<Harness />);
    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(restoreFocusRef.current).toHaveFocus();
  });
});
