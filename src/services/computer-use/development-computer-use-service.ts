import type {ComputerUseService} from './computer-use-service';
import type {
  ComputerUseEvent,
  ComputerUseHealth,
  ComputerUseRequest,
} from './computer-use.types';

interface PendingApproval {
  approvalId: string;
  resolve(approved: boolean): void;
}

/** Deterministic DEV-only service for real launcher keyboard acceptance. */
export class DevelopmentComputerUseService implements ComputerUseService {
  private readonly approvals = new Map<number, PendingApproval>();

  async health(): Promise<ComputerUseHealth> {
    return {
      state: 'ready',
      mode: 'python',
      browser: 'Microsoft Edge',
      credentialConfigured: true,
    };
  }

  async *stream(
    request: ComputerUseRequest,
    signal: AbortSignal,
  ): AsyncIterable<ComputerUseEvent> {
    yield {type: 'started', model: request.model, browser: 'Microsoft Edge'};
    const approvalId = `development-${request.taskId}`;
    yield {
      type: 'approvalRequired',
      approvalId,
      explanation: 'Submit the deterministic browser form?',
    };
    const approved = await new Promise<boolean | null>((resolve) => {
      const onAbort = () => resolve(null);
      signal.addEventListener('abort', onAbort, {once: true});
      this.approvals.set(request.taskId, {
        approvalId,
        resolve: (response) => {
          signal.removeEventListener('abort', onAbort);
          resolve(response);
        },
      });
    });
    this.approvals.delete(request.taskId);
    if (approved === null) return;
    yield {type: 'approvalResolved', approvalId, approved};
    if (!approved) {
      yield {type: 'cancelled'};
      return;
    }
    await new Promise<void>((resolve) => {
      if (signal.aborted) resolve();
      else signal.addEventListener('abort', () => resolve(), {once: true});
    });
  }

  async respond(taskId: number, approvalId: string, approved: boolean) {
    const pending = this.approvals.get(taskId);
    if (!pending || pending.approvalId !== approvalId) {
      throw new Error('The requested development approval is no longer pending.');
    }
    pending.resolve(approved);
  }
}
