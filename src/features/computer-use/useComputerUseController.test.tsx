import {act, render, renderHook, screen, waitFor} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {AppProviders} from '../../app/AppProviders';
import type {ComputerUseService} from '../../services/computer-use/computer-use-service';
import type {
  ComputerUseEvent,
  ComputerUseRequest,
} from '../../services/computer-use/computer-use.types';
import {ComputerUsePanel} from './ComputerUsePanel';
import {type ComputerUseController, useComputerUseController} from './useComputerUseController';

const options = {
  model: 'gemini-3.6-flash' as const,
  initialUrl: 'https://www.google.com',
  cloudConsent: true,
};

function panelController(overrides: Partial<ComputerUseController> = {}): ComputerUseController {
  return {
    phase: 'idle',
    health: {
      state: 'ready',
      mode: 'python',
      browser: 'Microsoft Edge',
      credentialConfigured: true,
    },
    model: 'gemini-3.6-flash',
    browser: 'Microsoft Edge',
    activity: [],
    refreshHealth: async () => undefined,
    start: async () => undefined,
    approve: async () => undefined,
    deny: async () => undefined,
    stop: () => undefined,
    ...overrides,
  };
}

function renderPanel(controller: ComputerUseController) {
  return render(
    <AppProviders appearance={{mode: 'dark', transparency: 'disabled', effects: 'reduced', motion: 'reduced'}}>
      <ComputerUsePanel cloudConsent controller={controller} draftTask="review the support form" onOpenSettings={() => undefined} onStart={() => undefined} />
    </AppProviders>,
  );
}

class MemoryComputerUseService implements ComputerUseService {
  request?: ComputerUseRequest;
  requests: ComputerUseRequest[] = [];
  responses: Array<{taskId: number; approvalId: string; approved: boolean}> = [];
  private approvalResolve?: () => void;
  private approvalResult = true;
  private responseResolve?: () => void;
  private responseWait?: Promise<void>;

  constructor(private readonly approval = false, deferResponse = false) {
    if (deferResponse) {
      this.responseWait = new Promise((resolve) => {
        this.responseResolve = resolve;
      });
    }
  }

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
    this.requests.push(request);
    yield {type: 'started', model: request.model, browser: 'Microsoft Edge'};
    yield {type: 'action', action: 'navigate'};
    if (this.approval) {
      yield {type: 'approvalRequired', approvalId: 'approval1', explanation: 'Submit this form?'};
      await new Promise<void>((resolve) => {
        this.approvalResolve = resolve;
      });
      yield {type: 'approvalResolved', approvalId: 'approval1', approved: this.approvalResult};
      if (!this.approvalResult) {
        yield {type: 'cancelled'};
        return;
      }
    }
    yield {type: 'completed', summary: 'The browser task is complete.'};
  }

  async respond(taskId: number, approvalId: string, approved: boolean) {
    this.responses.push({taskId, approvalId, approved});
    await this.responseWait;
    this.approvalResult = approved;
    this.approvalResolve?.();
  }

  releaseResponse() {
    this.responseResolve?.();
  }
}

describe('useComputerUseController', () => {
  it('keeps approval and a later failure inside the Computer Use workspace with textual status', () => {
    const {rerender} = renderPanel(panelController({
      phase: 'approval',
      task: 'Submit the support form',
      approval: {id: 'approval1', explanation: 'Submit this form?'},
    }));

    expect(screen.getByRole('status', {name: 'Approval required'})).toHaveTextContent('Approval required');
    expect(screen.getByRole('alertdialog', {name: 'Approve Computer Use action'})).toHaveTextContent('Submit this form?');
    expect(screen.getByRole('button', {name: 'Deny and stop'})).toBeVisible();

    rerender(
      <AppProviders appearance={{mode: 'dark', transparency: 'disabled', effects: 'reduced', motion: 'reduced'}}>
        <ComputerUsePanel cloudConsent controller={panelController({phase: 'error', error: 'Worker connection closed.'})} draftTask="review the support form" onOpenSettings={() => undefined} onStart={() => undefined} />
      </AppProviders>,
    );

    expect(screen.getByRole('status', {name: 'Unavailable'})).toHaveTextContent('Unavailable');
    expect(screen.getByRole('alert')).toHaveTextContent('Worker connection closed.');
    expect(screen.queryByRole('alertdialog', {name: 'Approve Computer Use action'})).not.toBeInTheDocument();
  });

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
    expect(result.current.activity.map((item) => item.id)).toEqual([1, 2, 3]);
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

  it('keeps a denied sensitive action cancelled and reports it accurately', async () => {
    const service = new MemoryComputerUseService(true);
    const {result} = renderHook(() => useComputerUseController(service, options));

    act(() => {
      void result.current.start('Submit the support form');
    });
    await waitFor(() => expect(result.current.phase).toBe('approval'));

    await act(async () => result.current.deny());

    await waitFor(() => expect(result.current.phase).toBe('cancelled'));
    expect(result.current.activity.map((item) => item.label)).toContain('Sensitive action denied');
    expect(result.current.activity.map((item) => item.label)).not.toContain('Sensitive action approved');
    expect(service.responses).toEqual([{
      taskId: expect.any(Number),
      approvalId: 'approval1',
      approved: false,
    }]);
  });

  it('does not replace an active task before native cancellation completes', async () => {
    const service = new MemoryComputerUseService(true);
    const {result} = renderHook(() => useComputerUseController(service, options));

    act(() => {
      void result.current.start('Keep this task active');
    });
    await waitFor(() => expect(result.current.phase).toBe('approval'));

    await act(async () => result.current.start('Replace it too early'));

    expect(service.requests).toHaveLength(1);
    expect(service.request?.task).toBe('Keep this task active');
    await act(async () => result.current.deny());
  });

  it('accepts only the first response to a pending approval', async () => {
    const service = new MemoryComputerUseService(true, true);
    const {result} = renderHook(() => useComputerUseController(service, options));

    act(() => {
      void result.current.start('Approve one sensitive action');
    });
    await waitFor(() => expect(result.current.phase).toBe('approval'));

    let approve: Promise<void> | undefined;
    let deny: Promise<void> | undefined;
    act(() => {
      approve = result.current.approve();
      deny = result.current.deny();
    });

    expect(service.responses).toHaveLength(1);
    expect(service.responses[0]?.approved).toBe(true);
    await act(async () => {
      service.releaseResponse();
      await Promise.all([approve, deny]);
    });
    await waitFor(() => expect(result.current.phase).toBe('completed'));
  });
});
