import type {ComputerUseService} from './computer-use-service';
import type {ComputerUseEvent} from './computer-use.types';

export class UnavailableComputerUseService implements ComputerUseService {
  async health() {
    return {
      state: 'unavailable' as const,
      mode: 'missing' as const,
      browser: 'Microsoft Edge',
      credentialConfigured: false,
      detail: 'Computer Use is available in the native Lumen app.',
    };
  }

  async *stream(): AsyncIterable<ComputerUseEvent> {
    yield {
      type: 'failed',
      message: 'Computer Use is available in the native Lumen app.',
      code: 'native_required',
    };
  }

  async respond(): Promise<void> {
    throw new Error('Computer Use is not available in this browser preview.');
  }
}
