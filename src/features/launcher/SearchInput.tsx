import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import * as stylex from '@stylexjs/stylex';

import {LumenUiIcon} from '../../design-system/icons/LumenUiIcon';
import {LumenIconButton} from '../../design-system/primitives/LumenIconButton';
import {tokens} from '../../design-system/tokens.stylex';
import {measureAfterPaint} from '../diagnostics/diagnostics.metrics';
import {useQueryStore} from './query.store';
import type {LauncherIntent} from './launcher.store';

const styles = stylex.create({
  field: {
    minWidth: 0,
    display: 'flex',
    flex: 1,
    alignItems: 'center',
    gap: tokens.space2,
    marginInline: `calc(${tokens.space2} * -1)`,
    paddingBlock: tokens.space2,
    paddingInline: tokens.space2,
    backgroundColor: 'transparent',
    borderRadius: tokens.radiusSmall,
    boxShadow: 'inset 0 -1px 0 transparent',
    transitionDuration: tokens.durationHover,
    transitionProperty: 'background-color, box-shadow',
    transitionTimingFunction: tokens.easingStandard,
    ':focus-within': {
      backgroundColor: tokens.colorMaterialInset,
      boxShadow: `inset 0 -1px 0 ${tokens.colorFocusSoft}`,
    },
  },
  input: {
    width: '100%',
    minWidth: 0,
    padding: 0,
    color: tokens.colorTextPrimary,
    backgroundColor: 'transparent',
    borderWidth: 0,
    caretColor: tokens.colorAccent,
    fontFamily: tokens.fontFamilyText,
    fontSize: tokens.fontSizeSearch,
    fontWeight: tokens.fontWeightRegular,
    letterSpacing: tokens.letterSpacingTight,
    lineHeight: tokens.lineHeightTight,
    outline: 'none',
  },
  clear: {
    flexShrink: 0,
    color: tokens.colorTextTertiary,
  },
});

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
    const clear = useQueryStore((state) => state.clear);
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

    const commitAfterInputPaint = (value: string) => {
      cancelPendingCommit();
      pendingFrame.current = window.requestAnimationFrame(() => {
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
      measureAfterPaint('input-paint', startedAt);
      commitAfterInputPaint(value);
    };

    const handleCompositionEnd = () => {
      cancelPendingCommit();
      setDraft(inputRef.current?.value ?? '');
      endComposition();
    };

    return (
      <div role="search" aria-label={intent === 'computer' ? 'Browser task' : 'File search'} {...stylex.props(styles.field)}>
        <input
          ref={inputRef}
          aria-label={intent === 'computer' ? 'Describe a browser task' : 'Search files'}
          autoCapitalize="off"
          autoComplete="off"
          defaultValue={useQueryStore.getState().draft}
          enterKeyHint="search"
          placeholder={intent === 'computer' ? 'Ask Lumen to complete a browser task' : 'Search apps, files, and settings'}
          spellCheck={false}
          type="search"
          {...stylex.props(styles.input)}
          onCompositionEnd={handleCompositionEnd}
          onCompositionStart={startComposition}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
        />
        <span ref={clearWrapperRef} hidden={!useQueryStore.getState().draft}>
          <LumenIconButton
            aria-label="Clear search"
            className={stylex.props(styles.clear).className}
            size="small"
            variant="quiet"
            onPress={clearInput}
          >
            <LumenUiIcon name="close" size="small" />
          </LumenIconButton>
        </span>
      </div>
    );
  },
);
