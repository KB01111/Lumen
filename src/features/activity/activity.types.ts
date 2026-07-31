export type ActivityMode = 'indexing' | 'slow' | 'gaming' | 'fullscreen' | 'cinema' | 'idle' | 'battery' | 'user';

export interface ActivityPresentation {
  label: string;
  compactLabel: string;
  description: string;
  recommendation: string;
  tone: 'success' | 'info' | 'warning' | 'neutral';
}

export const activityPresentations: Record<ActivityMode, ActivityPresentation> = {
  indexing: {
    label: 'Indexing',
    compactLabel: 'Indexing',
    description: 'New local filenames are being discovered at normal priority.',
    recommendation: 'Search stays available while the development adapter refreshes.',
    tone: 'success',
  },
  slow: {
    label: 'Indexing slowly',
    compactLabel: 'Slow indexing',
    description: 'Background work is yielding more time to active applications.',
    recommendation: 'No action is needed; Lumen will resume full speed when the system is quieter.',
    tone: 'info',
  },
  gaming: {
    label: 'Paused for gaming',
    compactLabel: 'Gaming pause',
    description: 'A game classification paused background indexing.',
    recommendation: 'Exact search remains ready. Indexing resumes after the configured delay.',
    tone: 'warning',
  },
  fullscreen: {
    label: 'Paused for fullscreen app',
    compactLabel: 'Fullscreen pause',
    description: 'A fullscreen application asked Lumen to stay quiet.',
    recommendation: 'Leave fullscreen mode or override the application to resume.',
    tone: 'warning',
  },
  cinema: {
    label: 'Cinema mode',
    compactLabel: 'Cinema',
    description: 'Only lightweight metadata work is allowed during video playback.',
    recommendation: 'Content analysis waits until playback ends.',
    tone: 'info',
  },
  idle: {
    label: 'Waiting for idle',
    compactLabel: 'Waiting for idle',
    description: 'Queued background work is waiting for a calm system window.',
    recommendation: 'Using Lumen does not delay exact filename search.',
    tone: 'neutral',
  },
  battery: {
    label: 'Paused on battery',
    compactLabel: 'Battery pause',
    description: 'Background indexing is paused to protect battery life.',
    recommendation: 'Connect power or change the battery policy to resume.',
    tone: 'warning',
  },
  user: {
    label: 'Paused by user',
    compactLabel: 'Paused',
    description: 'You paused indexing from Lumen settings.',
    recommendation: 'Resume when you are ready; search remains available.',
    tone: 'neutral',
  },
};
