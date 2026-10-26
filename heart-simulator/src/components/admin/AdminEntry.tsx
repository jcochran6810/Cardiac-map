'use client';

import React from 'react';
import { useFeedbackStore } from '@/store/useFeedbackStore';
import * as admin from '@/lib/feedback/admin';
import { IconBell, IconLock } from '@/components/ui/icons';
import { IconButton } from '@/components/ui/Button';

const openPanel = () => useFeedbackStore.getState().setAdminOpen(true);

/** The bell in the top bar — only the signed-in admin sees it */
export function AdminBell() {
  const status = useFeedbackStore((s) => s.admin);
  const unread = useFeedbackStore((s) => s.unread);
  if (status !== 'signed-in') return null;
  const label = unread ? `Feedback: ${unread} new` : 'Feedback dashboard';
  return (
    <IconButton onClick={openPanel} aria-label={label} title={label} className="relative shrink-0">
      <IconBell size={18} />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold leading-[18px] text-center">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </IconButton>
  );
}

/** The very bottom of the main menu: "Admin login" for everyone; the admin's controls once signed in */
export function AdminFooter() {
  const status = useFeedbackStore((s) => s.admin);
  const email = useFeedbackStore((s) => s.adminEmail);
  const unread = useFeedbackStore((s) => s.unread);

  if (status !== 'signed-in') {
    return (
      <div className="mt-6 flex justify-center">
        <button type="button" onClick={openPanel} className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-slate-500 hover:text-slate-300">
          <IconLock size={12} />Admin login
        </button>
      </div>
    );
  }

  const signOut = async () => {
    try { await admin.signOut(); } catch { /* signed out locally either way */ }
    useFeedbackStore.getState().setAdmin('signed-out');
  };
  return (
    <section className="mt-6 p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/5" aria-label="Admin">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-emerald-300">Admin</span>
        <span className="text-[11px] text-slate-400 truncate">{email}</span>
        <button type="button" onClick={() => void signOut()} className="ml-auto text-[11px] text-slate-400 hover:text-white">Sign out</button>
      </div>
      <button type="button" onClick={openPanel} className="mt-2 w-full flex items-center gap-3 p-3 rounded-lg bg-cardiac-panel border border-slate-700 hover:border-emerald-500/60 text-left">
        <span className="w-9 h-9 shrink-0 rounded-lg bg-emerald-500/15 text-emerald-300 flex items-center justify-center"><IconBell size={20} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-white">Feedback dashboard</span>
          <span className="block text-[11px] text-slate-400">Bug reports, improvements and feature ideas from learners</span>
        </span>
        {unread > 0 && <span className="shrink-0 px-2 py-0.5 rounded-full bg-rose-500 text-white text-xs font-bold">{unread} new</span>}
      </button>
    </section>
  );
}
