import {render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {AppProviders} from '../../../app/AppProviders';
import {useSettingsStore} from '../settings.store';
import {PrivacyPage} from './PrivacyPage';

vi.mock('../../../design-system/icons/LumenUiIcon', () => ({
  LumenUiIcon: ({name, ...props}: {name: string}) => <svg {...props} data-lumen-ui-icon={name} />,
}));

function renderPage() {
  return render(
    <AppProviders appearance={{mode: 'dark', transparency: 'disabled', effects: 'reduced', motion: 'reduced'}}>
      <PrivacyPage />
    </AppProviders>,
  );
}

afterEach(() => {
  useSettingsStore.getState().reset();
});

describe('PrivacyPage', () => {
  it('supplies the storage glyph to Delete index', () => {
    renderPage();

    expect(screen.getByRole('button', {name: 'Delete index'}).querySelector('svg')).toHaveAttribute('data-lumen-ui-icon', 'storage');
  });
});
