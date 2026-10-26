'use client';

import { useEffect } from 'react';
import { useFeedbackStore } from '@/store/useFeedbackStore';
import * as admin from '@/lib/feedback/admin';
import { browserDeps, flushQueue, KIND_LABELS } from '@/lib/feedback/feedback';
import { IconBell, IconClose } from '@/components/ui/icons';

/** how often a signed-in admin's app checks for new reports */
const POLL_MS = 60_000;
/** how long a "new report" alert stays up */
const ALERT_MS = 12_000;

function setAppBadge(count: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (count > 0) void nav.setAppBadge?.(count).catch(() => undefined);
    else void nav.clearAppBadge?.().catch(() => undefined);
  } catch { /* not supported */ }
}

/**
 * Runs in the background of the app:
 * - sends feedback that was saved on this device (offline at the time) as soon as it can;
 * - keeps the admin signed in across visits, and checks for new reports every minute while the app
 *   is on screen — the count shows on the bell (and the installed app's icon), and a new report pops up.
 */
export default function FeedbackService() {
  const status = useFeedbackStore((s) => s.admin);
  const alert = useFeedbackStore((s) => s.alert);

  // Reports saved while offline go when the app starts and whenever the connection comes back
  useEffect(() => {
    const flush = () => { void flushQueue(browserDeps()); };
    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, []);

  // An admin signed in on this device stays signed in
  useEffect(() => {
    if (!admin.hasStoredSession()) return;
    const st = useFeedbackStore.getState();
    st.setAdmin('restoring');
    admin.restore()
      .then((email) => st.setAdmin(email ? 'signed-in' : 'signed-out', email))
      .catch(() => st.setAdmin('signed-out'));
  }, []);

  // While signed in: watch for new reports, and notice if the session ends
  useEffect(() => {
    if (status !== 'signed-in') { setAppBadge(0); return; }
    let stopped = false;
    // newest report already known, so only later ones raise an alert
    let seen: string | null = null;
    let first = true;
    const poll = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const { count, newest } = await admin.unread();
        if (stopped) return;
        const st = useFeedbackStore.getState();
        if (newest && !first && (!seen || newest.created_at > seen)) {
          st.setAlert({ id: newest.id, kind: newest.kind, message: newest.message });
        }
        if (newest && (!seen || newest.created_at > seen)) seen = newest.created_at;
        first = false;
        st.setUnread(count);
        setAppBadge(count);
      } catch { /* offline: try again on the next tick */ }
    };
    void poll();
    const id = window.setInterval(poll, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void poll(); };
    document.addEventListener('visibilitychange', onVisible);
    let unsubscribe: (() => void) | null = null;
    void admin.onSignedOut(() => useFeedbackStore.getState().setAdmin('signed-out')).then((u) => {
      if (stopped) u();
      else unsubscribe = u;
    });
    return () => {
      stopped = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      unsubscribe?.();
    };
  }, [status]);

  useEffect(() => {
    if (!alert) return;
    const id = window.setTimeout(() => useFeedbackStore.getState().setAlert(null), ALERT_MS);
    return () => window.clearTimeout(id);
  }, [alert]);

  if (!alert || status !== 'signed-in') return null;
  const open = () => {
    const st = useFeedbackStore.getState();
    st.setAlert(null);
    st.setAdminOpen(true);
  };
  return (
    <div role="status" className="fixed z-[70] top-14 right-3 max-w-sm phone:left-3 phone:max-w-none p-3 rounded-xl bg-slate-900/95 border border-emerald-500/50 shadow-2xl animate-fade-in">
      <div className="flex items-start gap-2.5">
        <span className="w-8 h-8 shrink-0 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center"><IconBell size={18} /></span>
        <button type="button" onClick={open} className="min-w-0 flex-1 text-left">
          <span className="block text-xs font-semibold text-emerald-300">New feedback · {KIND_LABELS[alert.kind]?.label ?? alert.kind}</span>
          <span className="block mt-0.5 text-sm text-white line-clamp-2 break-words">{alert.message}</span>
          <span className="block mt-1 text-[11px] text-sky-300">Open the dashboard →</span>
        </button>
        <button type="button" onClick={() => useFeedbackStore.getState().setAlert(null)} className="p-1 text-slate-400 hover:text-white" aria-label="Dismiss"><IconClose size={14} /></button>
      </div>
    </div>
  );
}
