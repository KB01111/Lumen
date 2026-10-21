import {expect, test} from '@playwright/test';

test('settings keep navigation available while a default page module loads', async ({page}) => {
  let release = () => {};
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/src/features/settings/pages/ProvidersPage.tsx*', async (route) => {
    await pending;
    await route.continue();
  });
  try {
    await page.goto('/?service=memory');
    await page.getByRole('searchbox').press('Control+,');
    await expect(page.getByRole('navigation', {name: 'Settings'})).toBeVisible();
    const providers = page.getByRole('tab', {name: 'Providers', exact: true});
    await providers.click();
    await expect(page.getByText('Loading settings…')).toBeVisible();
    await expect(page.getByRole('button', {name: 'Close settings'})).toBeEnabled();
    await expect(providers).toBeFocused();
    release();
    await expect(page.getByRole('button', {name: 'Add provider', exact: true})).toBeVisible();
    await expect(page.getByText('Loading settings…')).toBeHidden();
    await expect(providers).toBeFocused();
  } finally {
    release();
  }
});

test('a rejected settings module stays contained and can recover after reload', async ({page}) => {
  const module = '**/src/features/settings/pages/DiagnosticsPage.tsx*';
  await page.route(module, (route) => route.abort());
  await page.goto('/?service=memory');
  await page.getByRole('searchbox').press('Control+,');
  await page.getByRole('tab', {name: 'Diagnostics', exact: true}).click();
  await expect(page.getByRole('alert')).toContainText('This settings page could not load.');
  await expect(page.getByRole('button', {name: 'Close settings'})).toBeEnabled();
  await page.getByRole('tab', {name: 'Privacy', exact: true}).click();
  await expect(page.getByRole('switch', {name: 'File previews', exact: true})).toBeVisible();
  await expect(page.getByRole('alert')).toBeHidden();
  await page.getByRole('tab', {name: 'Diagnostics', exact: true}).click();
  await page.unroute(module);
  await page.getByRole('button', {name: 'Reload Lumen'}).click();
  await page.getByRole('searchbox').press('Control+,');
  await page.getByRole('tab', {name: 'Diagnostics', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Refresh diagnostics'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Reload Lumen'})).toBeHidden();
});
