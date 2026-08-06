import {useEffect, useRef, type RefObject} from 'react';

import type {SearchResult} from '../../services/search/search.types';
import {useLauncherStore, type LauncherFocusRegion} from '../launcher/launcher.store';
import {useQueryStore} from '../launcher/query.store';
import {
  readSelectionIntent,
  useSelectionStore,
} from '../launcher/selection.store';

type KeyboardAction = () => void | Promise<void>;

export interface LumenKeyboardOptions {
  detailsOpen: boolean;
  history: readonly string[];
  historyEnabled: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  intent: 'search' | 'computer';
  isExpanded: boolean;
  results: readonly SearchResult[];
  selectedId: string | null;
  onCloseDetails(): void;
  onOpen: KeyboardAction;
  onOpenContainingFolder: KeyboardAction;
  onOpenSettings: KeyboardAction;
  onRecallHistory(query: string): void;
  onRequestHide: KeyboardAction;
  onSelect(fileId: string | null): void;
  onShowDetails(): void;
}

function isElement(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement;
}

function regionForTarget(target: EventTarget | null): LauncherFocusRegion | null {
  if (!isElement(target)) {
    return null;
  }
  if (target.matches('input[type="search"], [role="searchbox"]')) {
    return 'search';
  }
  if (target.closest('[role="tablist"]')) {
    return 'scope';
  }
  if (target.closest('[role="row"]')) {
    return 'results';
  }
  if (target.closest('[aria-label="File preview"]')) {
    return 'preview';
  }
  return null;
}

function selectedResultElement(selectedId: string | null) {
  return [...document.querySelectorAll<HTMLElement>('[data-result-id]')]
    .find((element) => element.dataset.resultId === selectedId) ??
    document.querySelector<HTMLElement>('[data-result-id]:not([aria-disabled="true"])');
}

function previewRegionElement() {
  return document.querySelector<HTMLElement>('[aria-label="File preview"]');
}

function isRendered(element: HTMLElement | null) {
  let current: HTMLElement | null = element;
  while (current) {
    const style = window.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    current = current.parentElement;
  }
  return element !== null;
}

export function useLumenKeyboard({
  detailsOpen,
  history,
  historyEnabled,
  inputRef,
  intent,
  isExpanded,
  results,
  selectedId,
  onCloseDetails,
  onOpen,
  onOpenContainingFolder,
  onOpenSettings,
  onRecallHistory,
  onRequestHide,
  onSelect,
  onShowDetails,
}: LumenKeyboardOptions) {
  const historyIndexRef = useRef<number | null>(null);

  useEffect(() => {
    const setRegion = (region: LauncherFocusRegion) => {
      useLauncherStore.getState().setFocusRegion(region);
      useSelectionStore.getState().focusRegion(region);
    };

    const focusRegion = (region: LauncherFocusRegion) => {
      setRegion(region);
      if (region === 'search') {
        inputRef.current?.focus();
        return;
      }
      if (region === 'scope') {
        document.querySelector<HTMLElement>(
          '[role="tablist"] [role="tab"][data-selected="true"], [role="tablist"] [role="tab"]',
        )?.focus();
        return;
      }
      if (region === 'results') {
        selectedResultElement(
          readSelectionIntent() ?? selectedId,
        )?.focus();
        return;
      }
      const preview = previewRegionElement();
      if (isRendered(preview)) {
        preview?.focus();
      } else {
        document.querySelector<HTMLElement>(
          '[aria-label="Result actions"] button:not([disabled])',
        )?.focus();
      }
    };

    const handleTab = (event: KeyboardEvent) => {
      if (!isExpanded) {
        return;
      }
      const current = regionForTarget(event.target);
      if (!current) {
        return;
      }
      if (current === 'preview' && !event.shiftKey) {
        return;
      }
      event.preventDefault();
      if (event.shiftKey) {
        focusRegion(
          current === 'search'
            ? 'preview'
            : current === 'scope'
              ? 'search'
              : current === 'results'
                ? 'scope'
                : 'results',
        );
        return;
      }
      focusRegion(
        current === 'search'
          ? 'scope'
          : current === 'scope'
            ? 'results'
            : 'preview',
      );
    };

    const moveSelection = (direction: -1 | 1) => {
      const selectable = results.filter(
        (result) => (result.availability ?? 'available') === 'available',
      );
      if (selectable.length === 0) {
        return;
      }
      const liveSelectedId = readSelectionIntent() ?? selectedId;
      const currentIndex = selectable.findIndex((result) => result.id === liveSelectedId);
      const nextIndex = currentIndex < 0
        ? direction > 0 ? 0 : selectable.length - 1
        : Math.min(selectable.length - 1, Math.max(0, currentIndex + direction));
      onSelect(selectable[nextIndex]?.id ?? null);
      setRegion('results');
    };

    const recallHistory = (direction: -1 | 1) => {
      if (intent !== 'search' || !historyEnabled || history.length === 0) return false;
      const currentIndex = historyIndexRef.current;
      if (currentIndex !== null && useQueryStore.getState().draft !== history[currentIndex]) {
        historyIndexRef.current = null;
      }
      const index = historyIndexRef.current;
      if (direction < 0) {
        historyIndexRef.current = index === null ? 0 : Math.min(history.length - 1, index + 1);
      } else if (index === null) {
        return false;
      } else if (index === 0) {
        historyIndexRef.current = null;
        onRecallHistory('');
        return true;
      } else {
        historyIndexRef.current = index - 1;
      }
      onRecallHistory(history[historyIndexRef.current] ?? '');
      return true;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) {
        return;
      }
      const key = event.key.toLowerCase();

      if (event.ctrlKey && key === 'k') {
        event.preventDefault();
        focusRegion('search');
        return;
      }
      if (event.ctrlKey && event.key === ',') {
        event.preventDefault();
        void onOpenSettings();
        return;
      }
      if (event.key === 'Tab') {
        handleTab(event);
        return;
      }
      if (event.key === 'Escape') {
        if (regionForTarget(event.target) === 'search') {
          return;
        }
        if (detailsOpen) {
          event.preventDefault();
          onCloseDetails();
          inputRef.current?.focus();
          return;
        }
        const query = useQueryStore.getState().draft;
        if (query) {
          event.preventDefault();
          useQueryStore.getState().clear();
          focusRegion('search');
          return;
        }
        event.preventDefault();
        void onRequestHide();
        return;
      }

      const targetRegion = regionForTarget(event.target);
      if (targetRegion === 'search' && intent !== 'search') {
        return;
      }
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
        targetRegion !== 'scope' && targetRegion !== 'preview') {
        if (targetRegion === 'search' && recallHistory(event.key === 'ArrowDown' ? 1 : -1)) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        moveSelection(event.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (event.key === 'ArrowLeft' && targetRegion === 'results') {
        event.preventDefault();
        focusRegion('search');
        return;
      }
      if (event.key === 'ArrowRight' && targetRegion === 'results') {
        event.preventDefault();
        focusRegion('preview');
        return;
      }
      const liveSelectedId = readSelectionIntent() ?? selectedId;
      if (event.key !== 'Enter' || !liveSelectedId) {
        return;
      }
      if (isElement(event.target) && event.target.closest('button, [role="tab"]')) {
        return;
      }
      if (!event.ctrlKey && !event.altKey && targetRegion === 'results') {
        return;
      }
      event.preventDefault();
      if (event.ctrlKey) {
        void onOpenContainingFolder();
      } else if (event.altKey) {
        onShowDetails();
      } else {
        void onOpen();
      }
    };

    window.addEventListener('keydown', handleKeyDown, {capture: true});
    return () => window.removeEventListener('keydown', handleKeyDown, {capture: true});
  }, [
    detailsOpen,
    history,
    historyEnabled,
    inputRef,
    intent,
    isExpanded,
    onCloseDetails,
    onOpen,
    onOpenContainingFolder,
    onOpenSettings,
    onRecallHistory,
    onRequestHide,
    onSelect,
    onShowDetails,
    results,
    selectedId,
  ]);
}
