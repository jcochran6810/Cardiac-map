import { expect, test, type Page } from '@playwright/test';

/**
 * The case simulator on every layout (the projects in playwright.config.ts): a 12-lead the learner must read gets a
 * tracing big enough to read, the next action can still be tapped after a long reply (a phone on its side acts only
 * from the action column), and a finished case says how it ended on every screen, not only where the column shows.
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

/** Choose an action by its label. The click fails if the button cannot be scrolled into view or something covers it. */
async function act(page: Page, label: string) {
  let scope = page.locator('aside');
  if (!(await hasColumn(page))) {
    await page.getByRole('button', { name: 'What do you do next?' }).click();
    scope = page.getByRole('dialog', { name: 'Choose your next action' });
  }
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

  await act(page, 'Primary survey: airway, breathing, circulation');
  await act(page, 'Apply defibrillation pads');
  await act(page, 'Acquire a 12-lead ECG');

  // the read is open on the 12-lead tab: its tracing gets the room (a phone on its side once squashed it into 52 px)
  await expect(page.getByText('What does it show? Choose your read')).toBeVisible();
  const view = page.locator('[role=tablist][aria-label="Patient views"] + div');
  const tallest = () => view.locator('canvas').evaluateAll((cs) => Math.max(0, ...cs.map((c) => c.getBoundingClientRect().height)));
  await expect.poll(tallest, { message: 'the 12-lead tracing to read is tall enough to read' }).toBeGreaterThanOrEqual(140);

  // a wrong read brings a long reply; the next action can still be reached and tapped
  await giveRead(page, 'Sinus bradycardia');
  await expect(page.getByText(/^Not quite/).first()).toBeAttached();
  await act(page, 'SAMPLE history: allergies, medicines, past history');
  await page.getByRole('tab', { name: /^Case story/ }).click();
  await expect(page.locator('[aria-live="polite"]').getByText('SAMPLE history: allergies').first()).toBeVisible();

  // ending the case says so where the review button is, on every layout
  await page.getByRole('button', { name: 'End case' }).filter({ visible: true }).first().click();
  await expect(page.getByText('You ended the case early.').filter({ visible: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'See your score and review →' }).filter({ visible: true })).toBeVisible();
});
