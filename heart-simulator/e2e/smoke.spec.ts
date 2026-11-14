import { expect, test, type Page } from '@playwright/test';

/**
 * Smoke test of the main screens on a small phone, a phone upright and on its side, a tablet and a desktop
 * (the projects in playwright.config.ts): each screen opens, nothing spills sideways off the page, and the
 * browser reports no errors. It catches layout and wiring regressions, not clinical ones (those are the unit tests).
 */

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // skip the first-visit welcome card and first-time tips (one test opens the welcome card on purpose)
  await page.addInitScript(() => {
    try {
      if (!window.location.hash.includes('welcome')) localStorage.setItem('cardiosim.welcomed', '1');
      localStorage.setItem('cardiosim.hint.ecg-leads', '1');
    } catch { /* storage unavailable */ }
  });
});

test.afterEach(() => {
  expect(errors, 'errors reported by the page').toEqual([]);
});

/** Nothing on the page is wider than the screen */
async function noSidewaysScroll(page: Page, where: string) {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(extra, `${where}: the page scrolls sideways by ${extra}px`).toBeLessThanOrEqual(1);
}

async function openMenu(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /Learn step by step/ })).toBeVisible();
}

test('main menu', async ({ page }) => {
  await openMenu(page);
  await noSidewaysScroll(page, 'main menu');
  // the bottom of the menu is reachable
  await page.getByRole('button', { name: /^Glossary/ }).scrollIntoViewIfNeeded();
  await noSidewaysScroll(page, 'main menu, scrolled down');
});

test('first visit: the welcome card asks for a role', async ({ page }) => {
  await page.goto('/#welcome', { waitUntil: 'domcontentloaded' });
  const welcome = page.getByRole('dialog');
  await expect(welcome).toBeVisible();
  await noSidewaysScroll(page, 'welcome card');
  await welcome.getByRole('button', { name: /Paramedic/ }).first().click();
  await expect(page.getByRole('button', { name: /Learn step by step/ })).toBeVisible();
});

test('first visit: the welcome card offers the ER roles too', async ({ page }) => {
  await page.goto('/#welcome', { waitUntil: 'domcontentloaded' });
  const welcome = page.getByRole('dialog');
  await expect(welcome).toBeVisible();
  await welcome.getByRole('button', { name: /^ER Doctor/ }).click();
  await expect(welcome.getByText('You are set up as ER Doctor.')).toBeVisible();
  await noSidewaysScroll(page, 'welcome card, ER doctor chosen');
  await welcome.getByRole('button', { name: /Choose a different role/ }).click();
  await welcome.getByRole('button', { name: /^ER Nurse/ }).click();
  await expect(welcome.getByText('You are set up as ER Nurse.')).toBeVisible();
});

test('a condition with its 12-lead', async ({ page }) => {
  await openMenu(page);
  const search = page.getByRole('combobox').first();
  await search.fill('atrial fibrillation');
  await page.getByRole('option').filter({ hasText: 'Atrial Fibrillation' }).first().click();
  await expect(page.getByRole('heading', { name: /Atrial Fibrillation/ }).first()).toBeVisible();
  await noSidewaysScroll(page, 'condition page');
  await page.getByRole('button', { name: /^12-lead ECG/ }).last().click();
  await expect(page.locator('#ecg-drawer canvas').first()).toBeVisible();
  await noSidewaysScroll(page, 'condition page with the 12-lead');
  // the phone's Back slides the drawer away first, and the page stays
  await page.goBack();
  await expect(page.getByRole('heading', { name: /Atrial Fibrillation/ }).first()).toBeVisible();
});

test('a guided lesson', async ({ page }) => {
  await openMenu(page);
  await page.getByRole('button', { name: /All courses/ }).click();
  await page.locator('ol li button').first().click();
  const lesson = page.getByRole('complementary', { name: /^Lesson:/ });
  await expect(lesson).toBeVisible();
  await noSidewaysScroll(page, 'lesson, first step');
  await lesson.getByRole('button', { name: /^(Next|Skip)/ }).first().click();
  await expect(lesson.getByLabel(/Step 2 of/)).toBeVisible();
  await noSidewaysScroll(page, 'lesson, second step');
});

test('the rhythm trainer', async ({ page }) => {
  await openMenu(page);
  await page.getByRole('button', { name: /Practice rhythms/ }).click();
  await page.getByRole('button', { name: /Core rhythms/ }).click();
  await expect(page.getByRole('heading', { name: /What is this rhythm/ })).toBeVisible();
  await noSidewaysScroll(page, 'rhythm trainer');
  await page.getByRole('button', { name: /I am not sure/ }).click();
  await expect(page.getByRole('button', { name: /Next tracing/ })).toBeVisible();
});

test('the glossary, closed by the Back button', async ({ page }) => {
  await openMenu(page);
  await page.getByRole('button', { name: /^Glossary/ }).click();
  const glossary = page.getByRole('dialog', { name: 'Glossary' });
  await expect(glossary).toBeVisible();
  await glossary.getByLabel('Find a term').fill('preload');
  await expect(glossary.getByText('Preload', { exact: true })).toBeVisible();
  await noSidewaysScroll(page, 'glossary');
  await page.goBack();
  await expect(glossary).toBeHidden();
});
