import {expect, test} from '@playwright/test';

test('renders dark, light, and opaque shell variants', async ({page}) => {
  await page.goto('/?mode=foundation');

  const application = page.getByRole('application', {name: 'Lumen'});
  const launcher = page.getByLabel('Lumen launcher');

  await expect(application).toHaveAttribute('data-theme', 'dark');
  await expect(application).toHaveAttribute('data-transparency', 'native');
  await expect(launcher).toHaveAttribute('data-material', 'mica');
  await expect(page.getByText('Search apps, files, and settings')).toBeVisible();

  await page.keyboard.press('Control+Shift+L');
  await expect(application).toHaveAttribute('data-theme', 'light');

  await page.keyboard.press('Control+Shift+L');
  await expect(application).toHaveAttribute('data-theme', 'dark');
  await expect(application).toHaveAttribute('data-transparency', 'disabled');
});

