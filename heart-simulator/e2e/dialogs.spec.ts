import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * The modal dialogs — the welcome card, Help and the Glossary — hold the keyboard while they are open: the focus
 * starts in them and Tab stays in them, the app's shortcuts ("/" search, "T" tutor …) wait, Esc closes them from
 * anywhere and the focus goes back to what opened them. A sheet portalled over Help (the iPad install steps) takes
 * the keyboard in turn. The note left by "Decide later" on the welcome card never sits over a dialog.
 */

const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    try {
      if (!window.location.hash.includes('welcome')) localStorage.setItem('cardiosim.welcomed', '1');
      localStorage.setItem('cardiosim.installBanner', '1');
    } catch { /* storage unavailable */ }
  });
});

test.afterEach(() => {
  expect(errors, 'errors reported by the page').toEqual([]);
});

async function openMenu(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /Learn step by step/ })).toBeVisible();
}

/** Is the focus inside `dialog`? */
const focusIn = (dialog: Locator) => dialog.evaluate((d) => d.contains(document.activeElement));

test('Help and the Glossary keep the keyboard while open', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'keyboard shortcuts are a desktop matter');
  await openMenu(page);

  const helpTile = page.getByRole('button', { name: /Help & shortcuts/ });
  await helpTile.focus();
  await page.keyboard.press('Enter');
  const help = page.getByRole('dialog', { name: 'How to use CardioSim' });
  await expect(help).toBeVisible();
  await expect.poll(() => focusIn(help)).toBe(true);
  // "/" would put the focus in the menu's search box behind Help, "t" would open the tutor under it
  await page.keyboard.press('/');
  await page.keyboard.press('t');
  await page.waitForTimeout(300);
  expect(await focusIn(help)).toBe(true);
  await expect(page.getByRole('dialog', { name: 'Tutor' })).toHaveCount(0);
  for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
  expect(await focusIn(help)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await expect(helpTile).toBeFocused();

  const glossaryTile = page.getByRole('button', { name: /^Glossary/ });
  await glossaryTile.focus();
  await page.keyboard.press('Enter');
  const glossary = page.getByRole('dialog', { name: 'Glossary' });
  await expect(glossary.getByRole('textbox', { name: 'Find a term' })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab'); // a topic chip
  await page.keyboard.press('/');
  expect(await focusIn(glossary)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(glossary).toBeHidden();
  await expect(glossaryTile).toBeFocused();

  // with nothing open, the shortcut works again
  await page.keyboard.press('/');
  await expect(page.getByRole('combobox').first()).toBeFocused();
});

test.describe('iPad', () => {
  test.use({ userAgent: IPAD_UA });
  test.beforeEach(async ({ page }) => {
    // as on a real iPad, no browser install prompt: the Install button shows the Add to Home Screen steps
    await page.addInitScript(() => window.addEventListener('beforeinstallprompt', (e) => e.stopImmediatePropagation(), true));
  });

  test('the install steps opened from Help take the keyboard, then give it back', async ({ page }, info) => {
    test.skip(info.project.name !== 'tablet', 'an iPad with a keyboard');
    await openMenu(page);
    await page.getByRole('button', { name: /Help & shortcuts/ }).click();
    const help = page.getByRole('dialog', { name: 'How to use CardioSim' });
    await expect(help).toBeVisible();
    const install = help.getByRole('button', { name: /Install CardioSim on this device/ });
    await install.focus();
    await page.keyboard.press('Enter');
    const sheet = page.getByRole('dialog', { name: 'Install CardioSim' });
    await expect(sheet.getByRole('button', { name: 'Close' })).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    expect(await focusIn(sheet)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(help).toBeVisible();
    await expect(install).toBeFocused();
  });
});

test('the welcome note goes when a dialog opens over the menu', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'one screen is enough');
  await page.goto('/#welcome', { waitUntil: 'domcontentloaded' });
  await page.getByRole('dialog').getByRole('button', { name: 'Decide later' }).click();
  const note = page.getByText(/Change your role any time/);
  await expect(note).toBeVisible();
  await page.getByRole('button', { name: /^Glossary/ }).click();
  await expect(page.getByRole('dialog', { name: 'Glossary' })).toBeVisible();
  // at once, not by running out its time (no waiting here)
  expect(await note.count()).toBe(0);
});
