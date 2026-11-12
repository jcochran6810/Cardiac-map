import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/** A minimal browser (history with popstate fired as a separate task), installed before the app modules load */
const fake = vi.hoisted(() => {
  class FakeHistory {
    entries: unknown[] = [null];
    i = 0;
    get state() { return this.entries[this.i]; }
    get length() { return this.entries.length; }
    pushState(s: unknown) {
      this.entries = this.entries.slice(0, this.i + 1);
      this.entries.push(structuredClone(s));
      this.i += 1;
    }
    replaceState(s: unknown) { this.entries[this.i] = structuredClone(s); }
    go(n: number) {
      const t = this.i + n;
      if (t < 0 || t >= this.entries.length) return;
      this.i = t;
      setTimeout(() => {
        const ev = new Event('popstate') as Event & { state: unknown };
        ev.state = this.entries[this.i];
        window.dispatchEvent(ev);
      }, 0);
    }
    back() { this.go(-1); }
  }
  const ctl = { history: new FakeHistory(), stored: {} as Record<string, string> };
  Object.assign(globalThis, {
    window: Object.assign(new EventTarget(), {
      history: ctl.history, confirm: () => true, setTimeout, clearTimeout,
      localStorage: { getItem: (k: string) => ctl.stored[k] ?? null, setItem: (k: string, v: string) => { ctl.stored[k] = v; } },
    }),
  });
  return ctl;
});

import { currentPage, startBackNav, useBackNavStore } from '@/lib/backNav';
import { closeWelcome, useWelcomeStore, welcomeSeen } from '@/lib/welcome';

const history = fake.history;
const settle = async () => { for (let k = 0; k < 6; k++) await new Promise((r) => setTimeout(r, 0)); };
const back = async () => { history.back(); await settle(); };

let stop: () => void;
beforeAll(() => {
  // a first visit: the card is on screen over the main menu when the Back-button wiring starts
  expect(welcomeSeen()).toBe(false);
  useWelcomeStore.setState({ open: true, picked: null, notice: false });
  stop = startBackNav();
});
afterAll(() => stop());

describe('the first-visit welcome card and the phone\'s Back button', () => {
  it('Back puts the card off like "Decide later" and stays on the main menu, without "press Back again"', async () => {
    window.dispatchEvent(new Event('pointerdown')); // the first tap adds the entry the first Back on the menu uses
    await settle();
    expect(history.i).toBe(1);

    await back();
    expect(useWelcomeStore.getState()).toMatchObject({ open: false, notice: true });
    expect(welcomeSeen()).toBe(true);
    expect(useBackNavStore.getState().exitHint).toBe(false);
    expect(currentPage().mode).toBe('home');
    // still one Back away from asking before leaving
    expect(history.i).toBe(1);

    await back();
    expect(useBackNavStore.getState().exitHint).toBe(true);
  });

  it('after a role was picked, closing the card needs no note', () => {
    useWelcomeStore.setState({ open: true, picked: 3, notice: false });
    closeWelcome();
    expect(useWelcomeStore.getState()).toMatchObject({ open: false, notice: false });
  });
});
