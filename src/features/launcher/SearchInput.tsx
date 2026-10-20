import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {Button} from '@fluentui/react-components';

import {LumenUiIcon} from '../../design-system/icons/LumenUiIcon';
import {captureTiming} from '../diagnostics/diagnostics.metrics';
import {useQueryStore} from './query.store';
import type {LauncherIntent} from './launcher.store';

export interface SearchInputProps {
  intent?: LauncherIntent;
  onEscapeEmpty(): void;
  onSubmit?(task: string): void;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput({intent = 'search', onEscapeEmpty, onSubmit}, ref) {
    const setDraft = useQueryStore((state) => state.setDraft);
    const startComposition = useQueryStore((state) => state.startComposition);
    const endComposition = useQueryStore((state) => state.endComposition);
    const submit = useQueryStore((state) => state.submit);
    const clear = useQueryStore((state) => state.clear);
    const initialValue = useRef(useQueryStore.getState().draft);
    const inputRef = useRef<HTMLInputElement>(null);
    const clearWrapperRef = useRef<HTMLSpanElement>(null);
    const pendingFrame = useRef(0);
    const pendingTimer = useRef(0);

    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, []);

    useEffect(() => {
      const syncDraft = (value: string) => {
        if (inputRef.current && inputRef.current.value !== value) {
          inputRef.current.value = value;
        }
        if (clearWrapperRef.current) {
          clearWrapperRef.current.hidden = value.length === 0;
        }
      };
      syncDraft(useQueryStore.getState().draft);
      return useQueryStore.subscribe((state) => state.draft, syncDraft);
    }, []);

    useEffect(() => () => {
      window.cancelAnimationFrame(pendingFrame.current);
      window.clearTimeout(pendingTimer.current);
    }, []);

    const cancelPendingCommit = () => {
      window.cancelAnimationFrame(pendingFrame.current);
      window.clearTimeout(pendingTimer.current);
    };

    const commitAfterInputPaint = (value: string, startedAt: number) => {
      cancelPendingCommit();
      pendingFrame.current = window.requestAnimationFrame(() => {
        if (import.meta.env.DEV) captureTiming('input-next-frame', performance.now() - startedAt);
        pendingTimer.current = window.setTimeout(() => setDraft(value), 0);
      });
    };

    const clearInput = () => {
      cancelPendingCommit();
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      if (clearWrapperRef.current) {
        clearWrapperRef.current.hidden = true;
      }
      clear();
      inputRef.current?.focus();
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' && intent === 'computer' && !event.nativeEvent.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        const task = inputRef.current?.value ?? '';
        cancelPendingCommit();
        setDraft(task);
        onSubmit?.(task);
        return;
      }
      if (event.key === 'Enter' && intent === 'search' &&
        !event.nativeEvent.isComposing && !useQueryStore.getState().isComposing) {
        event.preventDefault();
        event.stopPropagation();
        const query = inputRef.current?.value ?? '';
        cancelPendingCommit();
        setDraft(query);
        submit();
        return;
      }
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (inputRef.current?.value) {
        clearInput();
      } else {
        onEscapeEmpty();
      }
    };

    const handleInput = (event: FormEvent<HTMLInputElement>) => {
      const startedAt = performance.now();
      const value = event.currentTarget.value;
      if (clearWrapperRef.current) {
        clearWrapperRef.current.hidden = value.length === 0;
      }
      captureTiming('input-response', performance.now() - startedAt);
      commitAfterInputPaint(value, startedAt);
    };

    const handleCompositionStart = () => {
      cancelPendingCommit();
      // Publish preceding ordinary input before composition changes its admission boundary.
      setDraft(inputRef.current?.value ?? '');
      startComposition();
    };

    const handleCompositionEnd = () => {
      cancelPendingCommit();
      setDraft(inputRef.current?.value ?? '');
      endComposition();
    };

    return (
      <div
        aria-label={intent === 'computer' ? 'Browser task' : 'File search'}
        className="flex min-w-0 flex-1 items-center gap-1"
        role="search"
      >
        <input
          ref={inputRef}
          aria-label={intent === 'computer' ? 'Describe a computer task' : 'Search files'}
          autoCapitalize="off"
          autoComplete="off"
          defaultValue={initialValue.current}
          enterKeyHint="search"
          placeholder={intent === 'computer' ? 'Describe browser task' : 'Search apps and files'}
          spellCheck={false}
          type="search"
          className="lumen-search-input min-w-0 flex-1 border-0 bg-transparent p-0 font-sans text-[1.0625rem] font-normal leading-tight tracking-tight text-[color:var(--einui-command-text)] caret-accent outline-none placeholder:text-[color:var(--einui-command-muted-text)]"
          onCompositionEnd={handleCompositionEnd}
          onCompositionStart={handleCompositionStart}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
        />
        <span ref={clearWrapperRef} hidden={!initialValue.current}>
          <Button
            aria-label="Clear search"
            appearance="subtle"
            data-launcher-control
            icon={<LumenUiIcon name="close" size="small" />}
            size="small"
            onClick={clearInput}
          />
        </span>
      </div>
    );
  },
);
