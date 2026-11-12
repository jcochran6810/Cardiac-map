import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * The 3D heart's controls in a lesson, on every layout (the projects in playwright.config.ts).
 *
 * "One heartbeat, step by step" asks the learner to watch "S1" and "S2" light up in the cardiac cycle box, so the box
 * keeps its S1 / S2 chips however small the 3D view is. On a phone on its side that step puts the heart beside the
 * ECG and the lesson's text: the heart gets half of the room beside the text, and its controls fold to one row inside
 * the view — the View menu and More, which holds the camera views — with the cycle box as one line under them. The
 * territory key gives way to an open More, and it starts open at a "tap the artery" step that says to read it.
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

/** Opens a lesson of a course from the course list and goes on to one of its steps ("4 / 7") */
async function openLesson(page: Page, course: string, lesson: RegExp, step: string) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cardiosim.welcomed', '1');
      localStorage.setItem('cardiosim.hint.ecg-leads', '1');
      localStorage.setItem('cardiosim.level', '2');
    } catch { /* storage unavailable */ }
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'All courses →' }).first().click();
  // The course's card may already be open (the list opens the first one): a click on it would close it. Wait for the
  // card, which comes with the library, and open it only if it is folded.
  const card = page.locator('button[aria-expanded]', { hasText: course }).first();
  await expect(card).toBeVisible();
  if ((await card.getAttribute('aria-expanded')) !== 'true') await card.click();
  await expect(card).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: lesson }).first().click();
  const player = page.locator('aside[aria-label^="Lesson"]');
  for (let i = 1; i < Number(step.split(' / ')[0]); i++) await player.getByRole('button', { name: /^(Next|Skip)/ }).click();
  await expect(player.getByText(step, { exact: true })).toBeVisible();
  return player;
}

/** "One heartbeat, step by step" at step 4, 'The valves shut: "lub"' */
async function openLubStep(page: Page) {
  const player = await openLesson(page, 'How the heart works', /One heartbeat, step by step/, '4 / 7');
  await expect(player.getByRole('heading', { name: /The valves shut: "lub"/ })).toBeVisible();
}

/** Is the control the one a tap at its middle lands on (nothing painted over it)? */
async function onTop(target: Locator) {
  const b = (await target.boundingBox())!;
  return target.evaluate((el, [x, y]) => {
    const at = document.elementFromPoint(x, y);
    return !!at && el.contains(at);
  }, [b.x + b.width / 2, b.y + b.height / 2]);
}

test('the cycle box keeps its S1 and S2 chips in a lesson, however small the 3D view', async ({ page }) => {
  // (on a 320 x 640 phone the heart is a strip above the lesson: only the one-line cycle box shows there)
  await openLubStep(page);
  const heart = page.locator('#heart-drawer');
  await expect(heart.getByText(/^S1( “lub”)?$/)).toBeVisible();
  await expect(heart.getByText(/^S2( “dub”)?$/)).toBeVisible();
});

test('on a phone on its side the heart beside the ECG keeps its controls inside the view, with More in reach', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone-landscape', 'the side-by-side layout is for a phone on its side');
  await openLubStep(page);
  const stage = (await page.locator('#heart-drawer main').boundingBox())!;
  const ecg = (await page.locator('#ecg-drawer').boundingBox())!;
  // half of the room beside the lesson's text, no longer under 200 px
  expect(stage.width).toBeGreaterThanOrEqual(220);
  expect(Math.abs(stage.width - ecg.width)).toBeLessThanOrEqual(16);

  const heart = page.locator('#heart-drawer');
  const view = heart.getByRole('combobox', { name: '3D view' });
  const more = heart.getByRole('button', { name: /^More/ });
  const inside = (b: { x: number; y: number; width: number; height: number }) =>
    b.x >= stage.x - 1 && b.y >= stage.y - 1 && b.x + b.width <= stage.x + stage.width + 1 && b.y + b.height <= stage.y + stage.height + 1;
  const viewBox = (await view.boundingBox())!;
  const moreBox = (await more.boundingBox())!;
  expect(inside(viewBox), 'the View menu is inside the 3D view').toBe(true);
  expect(inside(moreBox), 'More is inside the 3D view').toBe(true);
  // one row: More beside the View menu, not on top of it
  expect(Math.abs(moreBox.y - viewBox.y)).toBeLessThanOrEqual(4);
  expect(moreBox.x).toBeGreaterThanOrEqual(viewBox.x + viewBox.width - 1);
  // the camera views moved into More (no Views button of their own)
  await expect(heart.getByRole('button', { name: /^Views/ })).toHaveCount(0);

  // a real tap on More opens it, and the camera views are inside
  await page.touchscreen.tap(moreBox.x + moreBox.width / 2, moreBox.y + moreBox.height / 2);
  const toggles = page.locator('#scene-toggles');
  await expect(toggles).toBeVisible();
  await toggles.getByRole('button', { name: /^Views/ }).tap();
  await expect(toggles.getByRole('button', { name: 'Front', exact: true })).toBeVisible();
  expect(inside((await toggles.boundingBox())!), 'the open menu stays inside the 3D view').toBe(true);

  // the cycle box is one line, with its S1 / S2 chips
  const line = heart.locator('[data-cycle="line"]');
  await expect(line).toBeVisible();
  expect((await line.boundingBox())!.height).toBeLessThanOrEqual(30);
  await expect(line.getByText('S1', { exact: true })).toBeVisible();
  // (the aortic / pulmonic dot is "Ao": "AV valves" are the mitral and tricuspid ones in the rest of the app)
  await expect(line.getByText('Ao', { exact: true })).toBeVisible();
  await expect(line.getByText('AV', { exact: true })).toHaveCount(0);
});

test('on a phone on its side an open territory key leaves the camera views inside More within reach', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone-landscape', 'the side-by-side layout is for a phone on its side');
  await openLesson(page, 'Finding a heart attack on the 12-lead', /The front wall: a blocked LAD/, '2 / 7');
  const heart = page.locator('#heart-drawer');
  await expect(heart.locator('[data-cycle="line"]')).toBeVisible();
  // the key starts folded in the slim view; open it, then More and its camera views
  await heart.getByRole('button', { name: /^Territory key/ }).tap();
  await expect(heart.getByText('Perfusion territory')).toBeVisible();
  await heart.getByRole('button', { name: /^More/ }).tap();
  const toggles = page.locator('#scene-toggles');
  await toggles.getByRole('button', { name: /^Views/ }).tap();
  for (const name of ['Front', 'Bottom']) {
    const button = toggles.getByRole('button', { name, exact: true });
    // (the open menu scrolls when it runs out of room)
    await button.scrollIntoViewIfNeeded();
    expect(await onTop(button), `${name} is not under the territory key`).toBe(true);
  }
  const angio = toggles.getByRole('button', { name: 'Angio', exact: true });
  await angio.scrollIntoViewIfNeeded();
  expect(await onTop(angio), 'Angio is not under the territory key').toBe(true);

  // More closed: the camera views do not open again by themselves
  await page.keyboard.press('Escape');
  await expect(toggles).toHaveCount(0);
  await heart.getByRole('button', { name: /^More/ }).tap();
  await expect(toggles.getByRole('button', { name: /^Views/ })).toHaveAttribute('aria-expanded', 'false');
});

test('the territory key starts open at a "tap the artery" step that says to read the legend', async ({ page }, info) => {
  test.skip(info.project.name === 'small-phone', 'on a 320 x 640 phone the heart is a strip with no controls in a lesson');
  // "The legend names the artery that feeds the inferior wall. Find a name tag on the heart that ends in those letters."
  const player = await openLesson(page, 'The chest pain call', /Reading it fast/, '6 / 9');
  await expect(player.getByRole('heading', { name: /Find it from below/ })).toBeVisible();
  const heart = page.locator('#heart-drawer');
  await expect(heart.getByText('RCA — inferior LV, RV free wall')).toBeVisible();
  await expect(heart.getByRole('button', { name: /^Territory key/ })).toHaveCount(0);
});
