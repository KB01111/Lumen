import {open} from '@tauri-apps/plugin-dialog';

export interface RootSelectionService {
  chooseRoot(): Promise<string | null>;
}

class BrowserRootSelectionService implements RootSelectionService {
  async chooseRoot(): Promise<string> {
    return 'C:\\Projects\\Lumen Demo';
  }
}

class TauriRootSelectionService implements RootSelectionService {
  async chooseRoot(): Promise<string | null> {
    const selection = await open({
      directory: true,
      multiple: false,
      title: 'Choose a development search folder',
    });
    return typeof selection === 'string' ? selection : null;
  }
}

export function createRootSelectionService(): RootSelectionService {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    ? new TauriRootSelectionService()
    : new BrowserRootSelectionService();
}
