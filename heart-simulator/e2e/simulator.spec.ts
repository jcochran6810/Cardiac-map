import { expect, test, type Page } from '@playwright/test';

/**
 * The case simulator on every layout (the projects in playwright.config.ts): a 12-lead the learner must read gets a
 * tracing big enough to read, the next action can still be tapped after a long reply (a phone on its side acts only
 * from the action column), a finished case says how it ended on every screen, not only where the column shows, and the
 * monitor's keys take a blood pressure and a 12-lead in one tap.
 */

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => void d.accept());
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cardiosim.welcomed', '1');
      localStorage.setItem('cardiosim.hint.ecg-leads', '1');
    } catch { /* storage unavailable */ }
  });
});

test.afterEach(() => {
  expect(errors, 'errors reported by the page').toEqual([]);
});

/** The action column is shown (large screens, a phone on its side); otherwise actions come from a sheet */
const hasColumn = (page: Page) => page.locator('aside').isVisible();

/** The action menu: the column on large screens and a phone on its side, else the sheet the big button opens */
async function actions(page: Page) {
  if (await hasColumn(page)) return page.locator('aside');
  await page.getByRole('button', { name: 'What do you do next?' }).click();
  return page.getByRole('dialog', { name: 'Choose your next action' });
}

/**
 * Choose an action by its label, the way a learner does: open its category in the menu (or go back to the menu
 * first), then tap it. The click fails if the button cannot be scrolled into view or something covers it.
 */
async function act(page: Page, label: string, category: string) {
  const scope = await actions(page);
  const back = scope.getByRole('button', { name: 'Back to all the categories' });
  if (await back.isVisible()) await back.click();
  await scope.getByRole('navigation', { name: 'Action categories' }).getByRole('button', { name: new RegExp(`^${category}:`) }).click();
  await scope.locator('section[data-cat] button').filter({ has: page.getByText(label, { exact: true }) }).click({ timeout: 10_000 });
}

/** Give a 12-lead read: the list in the column, or the phone's drop-down */
async function giveRead(page: Page, label: string) {
  if (await hasColumn(page)) {
    const aside = page.locator('aside');
    await aside.getByRole('radio', { name: label, exact: true }).click();
    await aside.getByRole('button', { name: 'Check my read' }).click();
  } else {
    await page.locator('#ecg-read').selectOption({ label });
    await page.getByRole('button', { name: 'Check', exact: true }).click();
  }
}

test('a case: the 12-lead read, the next action, and the end', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Treat a patient/ }).first().click();
  await page.getByRole('radiogroup', { name: 'Your role' }).getByRole('radio', { name: 'Paramedic', exact: true }).click();
  const card = page.locator('#sim-case-beta-blocker-overdose-field');
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', { name: /Start case/ }).click();
  await expect(page.getByRole('button', { name: '← Cases' })).toBeVisible();

  await act(page, 'Primary survey: airway, breathing, circulation', 'Assessment');
  await act(page, 'Apply defibrillation pads', 'Monitoring, ECG & pressures');
  await act(page, 'Acquire a 12-lead ECG', 'Monitoring, ECG & pressures');

  // the read is open on the 12-lead tab: its tracing gets the room (a phone on its side once squashed it into 52 px)
  await expect(page.getByText('What does it show? Choose your read')).toBeVisible();
  const view = page.locator('[role=tablist][aria-label="Patient views"] + div');
  const tallest = () => view.locator('canvas').evaluateAll((cs) => Math.max(0, ...cs.map((c) => c.getBoundingClientRect().height)));
  await expect.poll(tallest, { message: 'the 12-lead tracing to read is tall enough to read' }).toBeGreaterThanOrEqual(140);

  // a wrong read brings a long reply; the next action can still be reached and tapped
  await giveRead(page, 'Sinus bradycardia');
  await expect(page.getByText(/^Not quite/).first()).toBeAttached();
  await act(page, 'SAMPLE history: allergies, medicines, past history', 'Assessment');
  await page.getByRole('tab', { name: /^Case story/ }).click();
  await expect(page.locator('[aria-live="polite"]').getByText('SAMPLE history: allergies').first()).toBeVisible();

  // ending the case says so where the review button is, on every layout
  await page.getByRole('button', { name: 'End case' }).filter({ visible: true }).first().click();
  await expect(page.getByText('You ended the case early.').filter({ visible: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'See your score and review →' }).filter({ visible: true })).toBeVisible();
});

test('the action menu: categories first, one category at a time, and search finds any action', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Treat a patient/ }).first().click();
  const card = page.getByRole('group', { name: 'Weak, dizzy and fainting' });
  await card.getByRole('button', { name: /Start case/ }).click();
  const scope = await actions(page);
  const menu = scope.getByRole('navigation', { name: 'Action categories' });
  // the menu: a tile per category, each with its number of actions; no long list of every action
  await expect(menu.getByRole('button', { name: /^Medications: \d+ actions/ })).toBeVisible();
  await expect(scope.locator('section[data-cat]')).toHaveCount(0);
  // one category on its own page, with a way back
  await menu.getByRole('button', { name: /^Medications:/ }).click();
  await expect(scope.getByRole('heading', { name: 'Medications' })).toBeVisible();
  await expect(scope.locator('section[data-cat="assess"]')).toHaveCount(0);
  // a big category is a short list of groups: one unfolds at a time
  const group = scope.getByRole('button', { name: /^Chest pain & clots/ });
  await expect(group).toHaveAttribute('aria-expanded', 'false');
  await expect(scope.getByText('Aspirin, chewed', { exact: true })).toHaveCount(0);
  await group.click();
  await expect(group).toHaveAttribute('aria-expanded', 'true');
  await expect(scope.getByText('Aspirin, chewed', { exact: true })).toBeVisible();
  await scope.getByRole('button', { name: 'Back to all the categories' }).click();
  await expect(menu).toBeVisible();
  // search reaches across the categories
  await scope.getByRole('searchbox', { name: 'Find an action' }).fill('pads');
  await expect(scope.locator('section[data-cat] button').filter({ hasText: 'Apply defibrillation pads' })).toBeVisible();
});

/**
 * The monitor and its keys as laid out now: the keys clear of the monitor's numbers and waveforms and taking none of its
 * height (they sit under its box, or beside it on a phone on its side), the monitor still tall enough to read
 * (`minHeight`) and its waveforms still wide enough (the monitor draws 6 s across the width the numbers and the keys leave
 * it), a key big enough for a finger, and nothing wider than the screen.
 */
async function checkMonitorLayout(page: Page, where: string, minHeight = 100) {
  const keys = page.getByRole('group', { name: 'Monitor keys' });
  const monitor = page.locator('[data-monitor]');
  const m = (await monitor.boundingBox())!;
  const box = (await monitor.locator('xpath=..').boundingBox())!;
  const k = (await keys.boundingBox())!;
  const wave = (await monitor.locator('canvas').first().boundingBox())!;
  expect(k.y >= m.y + m.height - 0.5 || k.x >= m.x + m.width - 0.5, `${where}: the keys do not cover the monitor`).toBe(true);
  expect(m.height, `${where}: the monitor keeps the height of its box`).toBeGreaterThanOrEqual(box.height - 12.5);
  expect(m.height, `${where}: the monitor's height`).toBeGreaterThanOrEqual(minHeight);
  expect(wave.width / m.width, `${where}: the waveforms keep most of the monitor's width`).toBeGreaterThanOrEqual(0.55);
  for (const b of await keys.getByRole('button').all()) expect((await b.boundingBox())!.height, `${where}: a key's height`).toBeGreaterThanOrEqual(36);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${where}: no sideways scroll`).toBe(true);
}

test('the monitor keys: a blood pressure and a 12-lead in one tap, without the menu', async ({ page }, info) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Treat a patient/ }).first().click();
  await page.getByRole('radiogroup', { name: 'Your role' }).getByRole('radio', { name: 'Paramedic', exact: true }).click();
  const card = page.locator('#sim-case-stemi-anterior-field');
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', { name: /Start case/ }).click();
  await expect(page.getByRole('button', { name: '← Cases' })).toBeVisible();

  // the keys sit under the monitor (beside it on a phone on its side)
  const keys = page.getByRole('group', { name: 'Monitor keys' });
  await expect(keys).toBeVisible();
  await checkMonitorLayout(page, info.project.name);

  // the 12-lead tab points to the key while there is no tracing
  await page.getByRole('tab', { name: '12-lead ECG' }).click();
  await expect(page.getByText(/Press the 12-lead key on the monitor \(or choose Acquire a 12-lead ECG/)).toBeVisible();
  await page.getByRole('tab', { name: /^Case story/ }).click();

  // no monitor yet: the blood pressure key takes a manual set, and says so; a double tap takes it once, not twice
  const story = page.locator('[aria-live="polite"]');
  const manual = /^BP \d+\/\d+ · pulse \d+/;
  await keys.getByRole('button', { name: /^Manual BP key/ }).dblclick();
  await expect(story.getByText(manual)).toBeVisible();
  await page.waitForTimeout(300);
  await expect(story.getByText(manual)).toHaveCount(1);

  // the 12-lead key records one; the 12-lead tab opens on it for the read, and the keys wait for the read
  await keys.getByRole('button', { name: /^12-lead key/ }).click();
  await expect(page.getByRole('tab', { name: '12-lead ECG' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('What does it show? Choose your read')).toBeVisible();
  await expect(keys).toHaveCount(0);
  await giveRead(page, 'Anterior STEMI');
  await expect(page.getByText(/^(Correct|Partly right|Not quite)/).first()).toBeAttached();

  // the 12-lead put the monitor on: the blood pressure key now runs the monitor's cuff, the 12-lead key a repeat
  await page.getByRole('tab', { name: /^Case story/ }).click();
  await expect(keys.getByRole('button', { name: /^Repeat 12-lead key/ })).toBeVisible();
  const nibp = keys.getByRole('button', { name: /^NIBP key/ });
  await nibp.click();
  await expect(story.getByText(/^NIBP \d+\/\d+ mmHg\.$/)).toBeVisible();
  // on a touch screen a tapped key does not stay lit (the hover look is for a mouse only)
  if (await page.evaluate(() => !matchMedia('(hover: hover)').matches)) {
    expect(await nibp.evaluate((b) => getComputedStyle(b).borderColor)).not.toContain('245, 158, 11');
  }

  // a phone on its side narrower than the Pixel 7 (an iPhone SE, 8 or 13 mini; the first iPhone SE): the waveforms
  // share the width with the numbers and the keys, and must stay wide enough to read. (On a 320 px tall screen the
  // monitor's box is 48% of a 276 px column, about 99 px, with or without the keys.)
  if (info.project.name === 'phone-landscape') {
    for (const [width, height] of [[667, 375], [568, 320]]) {
      await page.setViewportSize({ width, height });
      await expect(keys).toBeVisible();
      await checkMonitorLayout(page, `${width}x${height}`, height < 360 ? 90 : 100);
    }
  }
});
