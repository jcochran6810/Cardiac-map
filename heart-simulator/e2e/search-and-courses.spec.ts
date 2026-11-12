import { expect, test, type Page } from '@playwright/test';

/**
 * Search and the main menu's course row, on every layout (the projects in playwright.config.ts): search offers only
 * the simulator cases written for the learner's role and opens the case list at the one chosen, without starting it;
 * the course row brings a cath lab role's own courses forward and snaps its cards clear of the screen edge.
 */

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
});

test.afterEach(() => {
  expect(errors, 'errors reported by the page').toEqual([]);
});

/** The main menu, as a learner who has already picked this role (1 EMT … 5 Cardiologist) */
async function openMenuAs(page: Page, role: number) {
  await page.addInitScript((r) => {
    try {
      localStorage.setItem('cardiosim.welcomed', '1');
      localStorage.setItem('cardiosim.hint.ecg-leads', '1');
      localStorage.setItem('cardiosim.level', String(r));
    } catch { /* storage unavailable */ }
  }, role);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /Learn step by step/ })).toBeVisible();
}

test('search offers a Paramedic only Paramedic cases, and opens the case list at the one chosen', async ({ page }) => {
  await openMenuAs(page, 2);
  const search = page.getByRole('combobox', { name: 'Search the library' });
  const results = page.locator('#menu-search-results');

  // the cath lab's cardiogenic-shock case is for the lab roles only
  await search.fill('cardiogenic shock');
  await expect(results.getByRole('option').first()).toBeVisible();
  await expect(results.getByRole('option', { name: /simulator/i })).toHaveCount(0);

  // keyboard: arrow down to a Paramedic case and press Enter
  await search.fill('fainting');
  await expect(results.getByRole('option', { name: /simulator.*Weak, dizzy and fainting/i })).toBeVisible();
  const names = await results.getByRole('option').allInnerTexts();
  const at = names.findIndex((n) => /simulator/i.test(n) && n.includes('Weak, dizzy and fainting'));
  for (let i = 0; i < at; i++) await search.press('ArrowDown');
  await search.press('Enter');

  // the case list, at that case: in view and focused, and the Enter that chose it did not also start it
  const card = page.getByRole('group', { name: 'Weak, dizzy and fainting' });
  await expect(card).toBeFocused();
  await expect(card).toBeInViewport({ ratio: 0.9 });
  await expect(page.getByRole('button', { name: 'End case' })).toHaveCount(0);
  // the next Tab is its Start button
  await page.keyboard.press('Tab');
  await expect(card.getByRole('button', { name: /Start case/ })).toBeFocused();
});

test('the course row: a cath lab role sees its lab courses early, and cards snap clear of the edge', async ({ page }) => {
  await openMenuAs(page, 3);
  const section = page.getByRole('region', { name: 'Courses' });
  const cards = section.getByRole('button').filter({ hasText: /lessons/ });
  await expect(cards.first()).toBeVisible();
  const titles = await cards.evaluateAll((els) => els.map((e) => e.querySelector('.font-semibold')?.textContent));
  expect(titles.slice(0, 3)).toEqual(['How the heart works', 'Cath lab foundations', 'Pressure, volume and heart sounds']);

  await section.scrollIntoViewIfNeeded();
  const snap = await cards.first().evaluate(async (first: HTMLElement) => {
    const row = first.parentElement!;
    const start = first.getBoundingClientRect().left;
    const second = row.children[1] as HTMLElement;
    // a swipe that stops a little short of the second card: the row snaps it to where the first one started
    row.scrollTo({ left: second.offsetLeft - first.offsetLeft - 6, behavior: 'instant' });
    await new Promise((r) => setTimeout(r, 500));
    // each summary is clamped to three lines
    const lines = Array.from(row.querySelectorAll<HTMLElement>('.line-clamp-3'), (s) => s.getBoundingClientRect().height / parseFloat(getComputedStyle(s).lineHeight));
    return { start, snapped: second.getBoundingClientRect().left, lines };
  });
  expect(snap.start).toBeGreaterThanOrEqual(16);
  expect(Math.abs(snap.snapped - snap.start)).toBeLessThanOrEqual(1);
  for (const l of snap.lines) expect(l).toBeLessThanOrEqual(3.05);
});
