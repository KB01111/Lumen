import {useState, type KeyboardEvent} from 'react';

import {KeyboardIcon} from '@phosphor-icons/react';

import {LumenButton} from '../../../design-system/primitives/LumenButton';

function displayKey(event: KeyboardEvent) {
  if (event.code === 'Space') {
    return 'Space';
  }
  if (event.key.length === 1) {
    return event.key.toUpperCase();
  }
  return event.key.replace('Arrow', '');
}

function chordFromEvent(event: KeyboardEvent) {
  if (['Alt', 'Control', 'Shift', 'Meta'].includes(event.key)) {
    return null;
  }
  const parts = [
    event.ctrlKey ? 'Ctrl' : '',
    event.altKey ? 'Alt' : '',
    event.shiftKey ? 'Shift' : '',
    event.metaKey ? 'Win' : '',
    displayKey(event),
  ].filter(Boolean);
  return (event.ctrlKey || event.altKey || event.metaKey) ? parts.join(' + ') : null;
}

export interface ShortcutRecorderProps {
  isDisabled?: boolean;
  value: string;
  onChange(value: string): void;
  onInvalid?(message: string): void;
}

export function ShortcutRecorder({isDisabled, value, onChange, onInvalid}: ShortcutRecorderProps) {
  const [recording, setRecording] = useState(false);

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!recording) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      setRecording(false);
      return;
    }
    const chord = chordFromEvent(event);
    if (!chord) {
      onInvalid?.('Include Alt, Ctrl, or the Windows key.');
      return;
    }
    onChange(chord);
    onInvalid?.('');
    setRecording(false);
  };

  return (
    <LumenButton
      aria-label="Global shortcut"
      aria-pressed={recording}
      isDisabled={isDisabled}
      size="small"
      variant={recording ? 'primary' : 'subtle'}
      onKeyDown={handleKeyDown}
      onPress={() => setRecording(true)}
    >
      <KeyboardIcon aria-hidden="true" size={15} />
      {recording ? 'Press a shortcut' : value}
    </LumenButton>
  );
}
