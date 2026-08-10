import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect, it, vi} from 'vitest';

import {LumenButton} from '../../../design-system/primitives/LumenButton';
import {ConfirmationDialog} from './ConfirmationDialog';

it('uses the semantic scrim utility for the confirmation overlay', async () => {
  const user = userEvent.setup();
  render(
    <ConfirmationDialog
      confirmLabel="Delete"
      description="This is destructive."
      title="Confirm deletion"
      onConfirm={vi.fn()}
    >
      <LumenButton>Open confirmation</LumenButton>
    </ConfirmationDialog>,
  );

  await user.click(screen.getByRole('button', {name: 'Open confirmation'}));

  const overlay = screen.getByRole('dialog', {name: 'Confirm deletion'}).parentElement?.parentElement;
  expect(overlay).toHaveClass('bg-scrim');
  expect(overlay).not.toHaveClass('bg-black/60');
});
