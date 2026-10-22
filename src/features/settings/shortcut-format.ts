/**
 * Splits a persisted chord such as `Ctrl + Shift + K` or `Alt+Space` into its keys. A `+` only
 * delimits when a key follows it, so a literal plus key survives (`Ctrl + +`, `Ctrl+Shift++`).
 */
export function shortcutKeys(shortcut: string): string[] {
  return shortcut.split(/\s*\+\s*(?=\S)/).map((key) => key.trim()).filter(Boolean);
}

/** Screen-reader label for a persisted chord, e.g. `Ctrl plus Shift plus K`. */
export function shortcutAriaLabel(shortcut: string): string {
  return shortcutKeys(shortcut).join(' plus ');
}

/** Compact visual label for key hints, e.g. `Ctrl  Shift  K`. */
export function shortcutHintLabel(shortcut: string): string {
  return shortcutKeys(shortcut).join('  ');
}
