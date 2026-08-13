import type {ComponentType, SVGProps} from 'react';
import {
  ArrowRight,
  Bolt,
  Bug,
  Camera,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  ColorTheme,
  Connect,
  Copy,
  DataControls,
  Desktop,
  Document,
  Download,
  FileImage,
  Folder,
  FolderOpen,
  Globe,
  Grid,
  Info,
  Key,
  Keyboard,
  Paperclip,
  Pause,
  Pin,
  PinFilled,
  Play,
  Plus,
  Pulse,
  Regenerate,
  Reload,
  Search,
  Settings,
  ShieldCheck,
  Sparkle,
  Speed,
  Storage,
  Stop,
  Tools,
  Trash,
  User,
  Voice,
  Warning,
  X,
} from '@openai/apps-sdk-ui/components/Icon';

import {cn} from '../../lib/cn';

const icons = {
  approval: Check,
  add: Plus,
  attachment: Paperclip,
  bolt: Bolt,
  bug: Bug,
  camera: Camera,
  close: X,
  clock: Clock,
  colorTheme: ColorTheme,
  connect: Connect,
  computer: Desktop,
  copy: Copy,
  delete: Trash,
  document: Document,
  download: Download,
  error: Warning,
  folder: Folder,
  folderOpen: FolderOpen,
  forward: ArrowRight,
  grid: Grid,
  hardware: DataControls,
  image: FileImage,
  info: Info,
  key: Key,
  keyboard: Keyboard,
  model: Sparkle,
  next: ChevronRight,
  pause: Pause,
  pin: Pin,
  pinned: PinFilled,
  play: Play,
  pulse: Pulse,
  previous: ChevronLeft,
  privacy: ShieldCheck,
  refresh: Reload,
  retry: Regenerate,
  search: Search,
  settings: Settings,
  stop: Stop,
  storage: Storage,
  success: CheckCircle,
  speed: Speed,
  tools: Tools,
  user: User,
  voice: Voice,
  web: Globe,
} satisfies Record<string, ComponentType<SVGProps<SVGSVGElement>>>;

export type LumenUiIconName = keyof typeof icons;

export interface LumenUiIconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  name: LumenUiIconName;
  size?: 'small' | 'medium' | 'large';
}

export function LumenUiIcon({className, name, size = 'medium', ...props}: LumenUiIconProps) {
  const Icon = icons[name];
  return (
    <Icon
      {...props}
      aria-hidden="true"
      className={cn(size === 'small' && 'size-4', size === 'medium' && 'size-5', size === 'large' && 'size-6', className)}
      focusable="false"
    />
  );
}
