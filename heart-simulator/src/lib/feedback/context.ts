import { useAppStore, LEVEL_LABELS } from '@/store/useAppStore';
import { useECGStore } from '@/store/useECGStore';
import { useSimStore } from '@/store/useSimStore';
import { CATEGORY_BY_VALUE } from '@/lib/categories';
import { nameOf } from '@/lib/actions';
import { currentPage } from '@/lib/backNav';
import { SCENARIO_BY_ID } from '@/lib/sim/scenario/scenarios';
import type { FeedbackContext } from '@/lib/feedback/feedback';

const ECG_VIEW: Record<string, string> = { ecg: '12-lead', wiggers: 'Wiggers / PV', defib: 'defibrillator' };

/** Where the learner is, in words: "Learn › Conditions › Anterior STEMI (3D heart, 12-lead open)" */
export function describePage(): string {
  const page = currentPage();
  if (page.mode === 'home') return 'Main menu';
  if (page.mode === 'simulator') {
    const s = useSimStore.getState().state;
    const title = s ? SCENARIO_BY_ID[s.scenarioId]?.title ?? s.scenarioId : null;
    return title ? `Simulator › ${title} (${page.sim})` : 'Simulator › case list';
  }
  const parts = ['Learn', CATEGORY_BY_VALUE[page.cat ?? useAppStore.getState().activePanelCategory].label];
  if (page.item) parts.push(nameOf(page.item));
  const open = [
    page.heart !== 'closed' && `3D heart${page.heart === 'full' ? ' full screen' : ''}`,
    page.ecg !== 'closed' && `${page.lab ? 'electrode lab' : ECG_VIEW[useECGStore.getState().bottomView] ?? 'ECG'}${page.ecg === 'full' ? ' full screen' : ''}`,
  ].filter(Boolean);
  return `${parts.join(' › ')}${open.length ? ` (${open.join(', ')} open)` : ''}`;
}

function installed(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

/** What goes with a report so it can be acted on — nothing personal */
export function feedbackContext(): FeedbackContext {
  const app = useAppStore.getState();
  const device = app.phone ? 'phone' : app.compact ? 'tablet' : 'desktop';
  return {
    page: describePage(),
    role: LEVEL_LABELS[app.learningLevel].short,
    device: installed() ? `${device}, installed app` : device,
    screen: `${window.innerWidth}×${window.innerHeight}`,
    build: process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev',
    userAgent: navigator.userAgent,
    language: navigator.language,
    sentAt: new Date().toISOString(),
  };
}
