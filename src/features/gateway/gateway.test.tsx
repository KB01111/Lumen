import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it} from 'vitest';

import {AppProviders} from '../../app/AppProviders';
import {AgentGatewayPage} from '../settings/pages/AgentGatewayPage';
import {LocalAiPage} from '../settings/pages/LocalAiPage';
import {useSettingsStore} from '../settings/settings.store';
import {useGatewayStore} from './gateway.store';
import type {GatewayState, HardwareState, ModelState} from './gateway.types';

function renderPage(children: React.ReactNode) {
  return render(<AppProviders appearance={{mode: 'dark', transparency: 'disabled', effects: 'reduced', motion: 'reduced'}}>{children}</AppProviders>);
}

afterEach(() => {
  useGatewayStore.getState().reset();
  useSettingsStore.getState().reset();
});

describe('Local AI states', () => {
  it.each(['npu', 'gpu', 'cpu', 'unavailable'] satisfies HardwareState[])(
    'renders hardware state %s without color-only meaning',
    (hardware) => {
      renderPage(<LocalAiPage model={{hardware, state: 'ready'}} />);
      expect(screen.getByTestId(`hardware-${hardware}`)).toHaveTextContent(/./);
    },
  );

  it.each(['missing', 'downloading', 'loading', 'ready', 'failed', 'fallback-active'] satisfies ModelState[])(
    'renders model state %s deterministically',
    (state) => {
      renderPage(<LocalAiPage model={{hardware: 'cpu', state, progress: 42}} />);
      expect(screen.getByTestId(`model-${state}`)).toBeVisible();
      if (state === 'downloading') {
        expect(screen.getByRole('progressbar', {name: 'Model download'})).toHaveAttribute('aria-valuenow', '42');
      }
    },
  );
});

describe('AgentGateway states and controls', () => {
  it.each(['starting', 'ready', 'unavailable'] satisfies GatewayState[])(
    'renders gateway state %s',
    (state) => {
      useGatewayStore.setState({gatewayState: state});
      renderPage(<AgentGatewayPage />);
      expect(screen.getByTestId(`gateway-${state}`)).toHaveTextContent(/./);
    },
  );

  it('changes a provider route and preserves its virtual alias', async () => {
    const user = userEvent.setup();
    renderPage(<AgentGatewayPage />);

    await user.click(screen.getByRole('button', {name: /Provider for lumen\.fast/}));
    await user.click(await screen.findByRole('option', {name: 'Windows local preview'}));
    expect(useGatewayStore.getState().routes[0]).toMatchObject({alias: 'lumen.fast', providerId: 'windows-local'});
  });

  it('requires explicit cloud consent and records the decision', async () => {
    const user = userEvent.setup();
    renderPage(<AgentGatewayPage />);

    await user.click(screen.getByRole('button', {name: 'Review cloud consent'}));
    expect(screen.getByRole('dialog', {name: 'Allow cloud provider requests?'})).toBeVisible();
    await user.click(screen.getByRole('button', {name: 'Allow cloud requests'}));

    expect(useSettingsStore.getState().ai.cloudAnswerConsent).toBe(true);
    expect(screen.getByText('Cloud consent granted')).toBeVisible();
  });

  it('tests provider and MCP actions as deterministic previews', async () => {
    const user = userEvent.setup();
    renderPage(<AgentGatewayPage />);

    await user.click(screen.getByRole('button', {name: 'Test local provider'}));
    expect(await screen.findByText('Local provider preview responded in 18 ms.')).toBeVisible();

    await user.click(screen.getByRole('button', {name: 'Test Files MCP'}));
    expect(await screen.findByText('Files MCP preview exposed 3 tools.')).toBeVisible();
  });
});
