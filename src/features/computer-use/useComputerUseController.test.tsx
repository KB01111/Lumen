import {act, renderHook, waitFor} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import type {ComputerUseService} from '../../services/computer-use/computer-use-service';
import type {
  ComputerUseEvent,
  ComputerUseRequest,
} from '../../services/computer-use/computer-use.types';
import {useComputerUseController} from './useComputerUseController';

const options = {
  model: 'gemini-3.6-flash' as const,
  initialUrl: 'https://www.google.com',
  cloudConsent: true,
};

class MemoryComputerUseService implements ComputerUseService {
  request?: ComputerUseRequest;
  responses: Array<{taskId: number; approvalId: string; approved: boolean}> = [];
  private approvalResolve?: () => void;

  constructor(private readonly approval = false) {}

  async health() {
    return {
      state: 'ready' as const,
      mode: 'python' as const,
      browser: 'Microsoft Edge',
      credentialConfigured: true,
    };
  }

  async *stream(request: ComputerUseRequest): AsyncIterable<ComputerUseEvent> {
    this.request = request;
    yield {type: 'started', model: request.model, browser: 'Microsoft Edge'};
    yield {type: 'action', action: 'navigate'};
    if (this.approval) {
      yield {type: 'approvalRequired', approvalId: 'approval1', explanation: 'Submit this form?'};
      await new Promise<void>((resolve) => {
        this.approvalResolve = resolve;
      });
      yield {type: 'approvalResolved', approvalId: 'approval1', approved: true};
    }
    yield {type: 'completed', summary: 'The browser task is complete.'};
  }

  async respond(taskId: number, approvalId: string, approved: boolean) {
    this.responses.push({taskId, approvalId, approved});
    this.approvalResolve?.();
  }
}

describe('useComputerUseController', () => {
  it('streams a browser task through the typed service boundary', async () => {
    const service = new MemoryComputerUseService();
    const {result} = renderHook(() => useComputerUseController(service, options));

    await waitFor(() => expect(result.current.health?.state).toBe('ready'));
    await act(async () => result.current.start('  Find the Lumen repository  '));

    expect(service.request).toMatchObject({
      task: 'Find the Lumen repository',
      model: 'gemini-3.6-flash',
      initialUrl: 'https://www.google.com',
      cloudConsent: true,
    });
    expect(result.current.phase).toBe('completed');
    expect(result.current.summary).toBe('The browser task is complete.');
    expect(result.current.activity.map((item) => item.label)).toContain('Navigate');
  });

  it('pauses for one explicit approval before the worker continues', async () => {
    const service = new MemoryComputerUseService(true);
    const {result} = renderHook(() => useComputerUseController(service, options));

    act(() => {
      void result.current.start('Submit the support form');
    });
    await waitFor(() => expect(result.current.phase).toBe('approval'));
    expect(result.current.approval?.explanation).toBe('Submit this form?');

    await act(async () => result.current.approve());
    await waitFor(() => expect(result.current.phase).toBe('completed'));
    expect(service.responses).toEqual([{
      taskId: expect.any(Number),
      approvalId: 'approval1',
      approved: true,
    }]);
  });
});
