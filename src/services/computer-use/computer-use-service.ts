import type {
  ComputerUseEvent,
  ComputerUseHealth,
  ComputerUseRequest,
} from './computer-use.types';

export interface ComputerUseService {
  health(): Promise<ComputerUseHealth>;
  stream(request: ComputerUseRequest, signal: AbortSignal): AsyncIterable<ComputerUseEvent>;
  respond(taskId: number, approvalId: string, approved: boolean): Promise<void>;
}
