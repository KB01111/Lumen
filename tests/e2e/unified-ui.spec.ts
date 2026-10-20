import {expect, test} from '@playwright/test';

test('AI presentation inherits the single Lumen theme without changing native transparency or typography', async ({page}) => {
  for (const theme of ['dark', 'light', 'opaque', 'high-contrast', 'reduced-motion']) {
    await page.goto(`/?gallery=1&scenario=ai-complete&capture=1&theme=${theme}`);
    const badge = page.locator('.lumen-ai-status');
    await expect(badge).toBeVisible();
    const styles = await badge.evaluate((element) => {
      const reference = document.createElement('span');
      reference.style.color = 'var(--lumen-success)';
      element.append(reference);
      const expected = getComputedStyle(reference).color;
      reference.remove();
      const root = document.querySelector('[role="application"]')!;
      const css = getComputedStyle(element);
      return {color: css.color, expected, font: css.fontFamily,
        documentScheme: getComputedStyle(document.documentElement).colorScheme,
        controlScheme: getComputedStyle(root).colorScheme,
        resolvedTheme: root.getAttribute('data-resolved-theme'),
        animations: element.getAnimations({subtree: true}).length,
        background: getComputedStyle(root).backgroundColor,
        htmlTheme: document.documentElement.getAttribute('data-astryx-theme'),
        htmlMode: document.documentElement.getAttribute('data-theme'),
      };
    });
    expect(styles.color, theme).toBe(styles.expected);
    expect(styles.font, theme).toContain('Segoe UI Variable');
    expect(styles.animations, theme).toBe(0);
    expect(styles.background, theme).toBe('rgba(0, 0, 0, 0)');
    expect(styles.documentScheme, theme).toBe('normal');
    expect(styles.controlScheme, theme).toBe(styles.resolvedTheme);
    expect(styles.htmlTheme, theme).toBeNull();
    expect(styles.htmlMode, theme).toBeNull();
    await expect(page.getByRole('searchbox', {name: 'Search files'})).toHaveCSS('font-size', '17px');
  }
});

test('provider form controls remain in the themed modal and return focus after Escape', async ({page}) => {
  await page.goto('/?gallery=1&scenario=providers-add&capture=1&theme=light&scale=200');
  const dialog = page.getByRole('dialog', {name: 'Add provider'});
  await expect(dialog).toBeVisible();
  const preset = dialog.getByRole('button', {name: /^Use /}).first();
  await preset.click();
  const model = dialog.getByRole('textbox', {name: 'Model', exact: true});
  await expect(model).toHaveClass(/fui-Input__input/);
  await model.fill('a-long-model-name-with-a-readable-suffix');
  await expect(model).toHaveValue('a-long-model-name-with-a-readable-suffix');
  expect(await model.evaluate((element) => Boolean(element.closest('.fui-FluentProvider')))).toBe(true);
  await expect(dialog.getByRole('button', {name: 'Add', exact: true})).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Add provider', exact: true})).toBeFocused();
});

test('a delayed or failed agent presentation import cannot block approval or Stop', async ({page}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let intercepted = false;
  await page.route((url) => /\/LumenAgentActivity(?:\.tsx|-[\w-]+\.js)$/.test(url.pathname), async (route) => {
    intercepted = true;
    await held;
    await route.abort();
  });
  try {
    await page.goto('/?gallery=1&scenario=computer-use-approval&capture=1', {waitUntil: 'domcontentloaded'});
    await expect.poll(() => intercepted).toBe(true);
    await expect(page.getByRole('button', {name: 'Approve once'})).toBeEnabled();
    await expect(page.getByRole('list', {name: 'Computer Use activity'})).toBeVisible();
    await page.getByRole('button', {name: 'Stop', exact: true}).click();
    await expect(page.getByRole('status', {name: 'Stopped', exact: true})).toBeVisible();
    release();
    await expect(page.getByRole('list', {name: 'Computer Use activity'})).toBeVisible();
    await expect(page.getByRole('button', {name: 'Run in Edge'})).toBeVisible();
  } finally {
    release();
  }
});

test('checked Windows controls use the Lumen accent and inverse foreground in every theme', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('appearance', JSON.stringify({
    mode: new URL(location.href).searchParams.get('theme') === 'light' ? 'light' : 'dark',
    transparency: 'native', effects: 'full', motion: 'reduced', density: 'comfortable', preview: 'automatic',
  })));
  for (const theme of ['dark', 'light', 'high-contrast']) {
    await page.emulateMedia({forcedColors: theme === 'high-contrast' ? 'active' : 'none'});
    await page.goto(`/?onboarded=1&service=memory&computerUse=memory&theme=${theme}`);
    await page.getByRole('button', {name: 'Switch to Computer Use'}).click();
    await page.getByRole('searchbox', {name: 'Describe a computer task'}).fill('Review the support form');
    await expect(page.getByRole('application', {name: 'Lumen'})).toHaveAttribute('data-resolved-theme', theme === 'light' ? 'light' : 'dark');
    const checkbox = page.getByRole('checkbox', {name: 'Request visible browser (Fast only)'});
    await checkbox.check();
    const colors = await checkbox.evaluate((element) => {
      const indicator = element.closest('.fui-Checkbox')!.querySelector('.fui-Checkbox__indicator')!;
      const reference = document.createElement('span');
      reference.style.cssText = 'color:var(--lumen-accent);background-color:var(--lumen-text-inverse)';
      indicator.append(reference);
      const accent = getComputedStyle(reference).color;
      const inverse = getComputedStyle(reference).backgroundColor;
      reference.remove();
      const css = getComputedStyle(indicator);
      return {background: css.backgroundColor, color: css.color, accent, inverse};
    });
    expect(colors.background, theme).toBe(colors.accent);
    expect(colors.color, theme).toBe(colors.inverse);
  }
});

test('Astryx progress stays local, static and outside the safety keyboard order', async ({page}) => {
  await page.goto('/?gallery=1&scenario=computer-use-approval&capture=1&theme=high-contrast&scale=200');
  const progress = page.getByRole('region', {name: 'Agent execution progress'});
  await expect(progress).toBeVisible();
  await expect(progress).toContainText('Waiting for your approval');
  await expect(progress.getByRole('button')).toHaveCount(0);
  const measured = await progress.evaluate((element) => {
    const reference = document.createElement('span');
    reference.style.color = 'var(--lumen-text-primary)';
    element.append(reference);
    const expected = getComputedStyle(reference).color;
    reference.remove();
    const label = [...element.querySelectorAll('*')].find((part) => part.textContent === 'Computer Use session');
    const icons = [...element.querySelectorAll('svg')].map((icon) => {
      const bounds = icon.getBoundingClientRect();
      return {width: bounds.width, height: bounds.height};
    });
    return {color: label && getComputedStyle(label).color, expected, icons,
      animations: element.getAnimations({subtree: true}).length,
      htmlTheme: document.documentElement.getAttribute('data-astryx-theme')};
  });
  expect(measured.color).toBe(measured.expected);
  expect(measured.icons.length).toBeGreaterThan(0);
  for (const icon of measured.icons) {
    expect(icon.width).toBeGreaterThan(0);
    expect(icon.height).toBeGreaterThan(0);
    expect(icon.width).toBeLessThanOrEqual(64);
  }
  expect(measured.animations).toBe(0);
  expect(measured.htmlTheme).toBeNull();
  await page.getByRole('button', {name: 'Deny and stop'}).click();
  await expect(progress).not.toContainText('Completed');
});
