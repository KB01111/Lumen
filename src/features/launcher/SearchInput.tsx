import {forwardRef, type KeyboardEvent} from 'react';
import {Input, SearchField} from 'react-aria-components';

import {XIcon} from '@phosphor-icons/react';
import * as stylex from '@stylexjs/stylex';

import {LumenIconButton} from '../../design-system/primitives/LumenIconButton';
import {tokens} from '../../design-system/tokens.stylex';
import {useQueryStore} from './query.store';

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
  onEscapeEmpty(): void;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput({onEscapeEmpty}, ref) {
    const draft = useQueryStore((state) => state.draft);
    const setDraft = useQueryStore((state) => state.setDraft);
    const startComposition = useQueryStore((state) => state.startComposition);
    const endComposition = useQueryStore((state) => state.endComposition);
    const clear = useQueryStore((state) => state.clear);

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (draft) {
        clear();
      } else {
        onEscapeEmpty();
      }
    };

    return (
      <SearchField
        aria-label="Search files"
        {...stylex.props(styles.field)}
        value={draft}
        onChange={setDraft}
      >
        <Input
          ref={ref}
          aria-label="Search files"
          autoCapitalize="off"
          autoComplete="off"
          enterKeyHint="search"
          placeholder="Search apps, files, and settings"
          spellCheck={false}
          {...stylex.props(styles.input)}
          onCompositionEnd={endComposition}
          onCompositionStart={startComposition}
          onKeyDown={handleKeyDown}
        />
        {draft ? (
          <LumenIconButton
            aria-label="Clear search"
            className={stylex.props(styles.clear).className}
            size="small"
            variant="quiet"
            onPress={clear}
          >
            <XIcon aria-hidden="true" size={15} weight="bold" />
          </LumenIconButton>
        ) : null}
      </SearchField>
    );
  },
);
