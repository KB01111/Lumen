import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it} from 'vitest';

import {AppProviders} from '../../app/AppProviders';
import {VisualStateGallery} from './VisualStateGallery';
import {galleryScenarios} from './scenarios';
import {requiredScenarioIds} from './gallery.types';

const finalLauncherScenarioIds = [
  'ai-waiting',
  'ai-streaming',
  'ai-complete',
  'ai-failure-local-results',
  'empty-local-with-answer',
  'computer-use-approval',
  'constrained-work-area',
] as const;

describe('VisualStateGallery', () => {
  it('contains every required deterministic scenario exactly once', () => {
    expect(new Set(galleryScenarios.map((item) => item.id))).toEqual(new Set(requiredScenarioIds));
    expect(galleryScenarios).toHaveLength(requiredScenarioIds.length);
  });

  it('includes deterministic states for answer lifecycle, approval, and constrained layout', () => {
    const ids = new Set(galleryScenarios.map((item) => item.id));

    for (const id of finalLauncherScenarioIds) {
      expect(ids).toContain(id);
    }
  });

  it('renders the focused collapsed launcher only for its focused scenario', () => {
    window.history.replaceState({}, '', '/?gallery=1&scenario=collapsed-idle&capture=1');
    const idle = render(
      <AppProviders appearance={{mode: 'dark', transparency: 'native', effects: 'full', motion: 'reduced'}}>
        <VisualStateGallery />
      </AppProviders>,
    );

    expect(screen.getByRole('searchbox', {name: 'Search files'})).not.toHaveFocus();
    idle.unmount();

    window.history.replaceState({}, '', '/?gallery=1&scenario=collapsed-focused&capture=1');
    render(
      <AppProviders appearance={{mode: 'dark', transparency: 'native', effects: 'full', motion: 'reduced'}}>
        <VisualStateGallery />
      </AppProviders>,
    );

    expect(screen.getByRole('searchbox', {name: 'Search files'})).toHaveFocus();
  });

  it('renders grouped results from a distinct deterministic fixture', async () => {
    window.history.replaceState({}, '', '/?gallery=1&scenario=expanded-results&capture=1');
    const expanded = render(
      <AppProviders appearance={{mode: 'dark', transparency: 'native', effects: 'full', motion: 'reduced'}}>
        <VisualStateGallery />
      </AppProviders>,
    );

    await waitFor(() => expect(screen.getByRole('grid', {name: 'Search results'})).toHaveAttribute('aria-rowcount', '6'));
    expanded.unmount();

    window.history.replaceState({}, '', '/?gallery=1&scenario=grouped-results&capture=1');
    render(
      <AppProviders appearance={{mode: 'dark', transparency: 'native', effects: 'full', motion: 'reduced'}}>
        <VisualStateGallery />
      </AppProviders>,
    );

    await waitFor(() => expect(screen.getByRole('grid', {name: 'Search results'})).toHaveAttribute('aria-rowcount', '3'));
  });

  it('renders production activity state inside the gallery surface', () => {
    window.history.replaceState({}, '', '/?gallery=1&scenario=activity-gaming');
    render(
      <AppProviders appearance={{mode: 'dark', transparency: 'native', effects: 'full', motion: 'reduced'}}>
        <VisualStateGallery />
      </AppProviders>,
    );

    expect(screen.getByRole('region', {name: 'Lumen visual state gallery'})).toHaveAttribute('data-gallery-scenario', 'activity-gaming');
    expect(screen.getByTestId('activity-gaming')).toBeVisible();
  });

  it('stops the deterministic streaming answer when the gallery control is clicked', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/?gallery=1&scenario=ai-streaming&capture=1');
    render(
      <AppProviders appearance={{mode: 'dark', transparency: 'native', effects: 'full', motion: 'reduced'}}>
        <VisualStateGallery />
      </AppProviders>,
    );

    await user.click(await screen.findByRole('button', {name: 'Stop answer'}));

    expect(screen.getByText('Stopped')).toBeVisible();
    expect(screen.queryByRole('button', {name: 'Stop answer'})).not.toBeInTheDocument();
  });

  it('applies deterministic approve and deny transitions without leaving the gallery seam', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/?gallery=1&scenario=computer-use-approval&capture=1');
    const approved = render(
      <AppProviders appearance={{mode: 'dark', transparency: 'native', effects: 'full', motion: 'reduced'}}>
        <VisualStateGallery />
      </AppProviders>,
    );

    await user.click(await screen.findByRole('button', {name: 'Approve once'}));
    expect(screen.getByRole('status', {name: 'Working'})).toBeVisible();
    expect(screen.getByText('Approved once in the deterministic gallery session')).toBeVisible();
    expect(screen.queryByRole('alertdialog', {name: 'Approve Computer Use action'})).not.toBeInTheDocument();
    approved.unmount();

    const denied = render(
      <AppProviders appearance={{mode: 'dark', transparency: 'native', effects: 'full', motion: 'reduced'}}>
        <VisualStateGallery />
      </AppProviders>,
    );
    await user.click(await screen.findByRole('button', {name: 'Deny and stop'}));
    expect(screen.getByRole('status', {name: 'Stopped'})).toBeVisible();
    expect(screen.getByText('Denied and stopped in the deterministic gallery session')).toBeVisible();
    denied.unmount();
  });

  it('exposes each registry category on its scenario option for evidence generators', () => {
    window.history.replaceState({}, '', '/?gallery=1&scenario=computer-use-approval');
    render(
      <AppProviders appearance={{mode: 'dark', transparency: 'native', effects: 'full', motion: 'reduced'}}>
        <VisualStateGallery />
      </AppProviders>,
    );

    expect(screen.getByRole('option', {name: 'Computer Use approval'})).toHaveAttribute('data-category', 'Computer Use');
    expect(screen.getByRole('option', {name: 'AI failure with local results'})).toHaveAttribute('data-category', 'Resilience');
  });
});
