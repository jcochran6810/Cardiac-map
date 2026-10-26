'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFeedbackStore } from '@/store/useFeedbackStore';
import * as admin from '@/lib/feedback/admin';
import {
  FEEDBACK_KINDS, FEEDBACK_STATUSES, KIND_LABELS, STATUS_LABELS, feedbackBackend, timeAgo, toCsv, type FeedbackItem, type FeedbackKind, type FeedbackStatus,
} from '@/lib/feedback/feedback';
import { IconClose, IconDownload, IconLock, IconRotate } from '@/components/ui/icons';

/**
 * The owner's admin panel: the sign-in form, and once signed in the feedback dashboard.
 * Only an account listed as a CardioSim admin gets past the sign-in (the database checks every read).
 */
export default function AdminPanel() {
  const open = useFeedbackStore((s) => s.adminOpen);
  const status = useFeedbackStore((s) => s.admin);
  if (!open) return null;
  const close = () => useFeedbackStore.getState().setAdminOpen(false);
  const signedIn = status === 'signed-in';
  return (
    <div className="fixed inset-0 z-[65] bg-black/60 flex items-center justify-center p-4 phone:p-0" onClick={close} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={signedIn ? 'Feedback dashboard' : 'Admin login'}
        className={`w-full ${signedIn ? 'max-w-4xl h-[90dvh]' : 'max-w-sm'} flex flex-col bg-cardiac-panel border border-slate-600 rounded-xl shadow-2xl overflow-hidden phone:max-w-none phone:h-full phone:rounded-none phone:border-0`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}
      >
        {signedIn ? <Dashboard onClose={close} /> : <Login onClose={close} restoring={status === 'restoring'} />}
      </div>
    </div>
  );
}

// ─── Sign in ───────────────────────────────────────────────────────────────

function Login({ onClose, restoring }: { onClose: () => void; restoring: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const configured = !!feedbackBackend();

  useEffect(() => { emailRef.current?.focus(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    setBusy(true);
    setError(null);
    try {
      const who = await admin.signIn(email, password);
      useFeedbackStore.getState().setAdmin('signed-in', who);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t sign in.');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2"><IconLock size={16} className="text-slate-400" />Admin login</h2>
        <button type="button" onClick={onClose} className="p-1 touch:p-2 text-slate-400 hover:text-white" aria-label="Close admin login"><IconClose size={16} /></button>
      </div>
      <form className="p-4 space-y-3" onSubmit={submit} noValidate>
        <p className="text-xs text-slate-400 leading-snug">For the CardioSim administrator: read the feedback learners send.</p>
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-slate-400 mb-1">Email</span>
          <input
            ref={emailRef}
            type="email"
            inputMode="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full h-10 rounded-lg bg-cardiac-dark border border-slate-600 focus:border-cardiac-accent outline-none px-2.5 text-sm text-white"
          />
        </label>
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-slate-400 mb-1">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full h-10 rounded-lg bg-cardiac-dark border border-slate-600 focus:border-cardiac-accent outline-none px-2.5 text-sm text-white"
          />
        </label>
        {!configured && <p className="text-sm text-amber-300">Admin sign-in isn’t switched on in this version yet.</p>}
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        <button type="submit" disabled={busy || restoring || !configured} className="w-full h-10 rounded-lg bg-cardiac-accent text-slate-950 text-sm font-semibold disabled:opacity-60">
          {busy || restoring ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────────────────

type KindFilter = FeedbackKind | 'all';
type StatusFilter = FeedbackStatus | 'open' | 'all';

const KIND_BADGE: Record<FeedbackKind, string> = {
  bug: 'bg-rose-500/20 text-rose-200 border-rose-400/40',
  improvement: 'bg-sky-500/20 text-sky-200 border-sky-400/40',
  feature: 'bg-amber-500/20 text-amber-200 border-amber-400/40',
};

const STATUS_BADGE: Record<FeedbackStatus, string> = {
  new: 'text-emerald-300',
  planned: 'text-sky-300',
  in_progress: 'text-amber-300',
  done: 'text-slate-400',
  wont_fix: 'text-slate-500',
};

const OPEN: FeedbackStatus[] = ['new', 'planned', 'in_progress'];

function Dashboard({ onClose }: { onClose: () => void }) {
  const email = useFeedbackStore((s) => s.adminEmail);
  const arrived = useFeedbackStore((s) => s.alert?.id);
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState<KindFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('open');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await admin.listFeedback();
      setItems(list);
      setError(null);
      useFeedbackStore.getState().setUnread(list.filter((f) => !f.read_at).length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t load the feedback.');
    } finally {
      setLoading(false);
    }
  }, []);

  // load now, and again whenever a new report is announced
  useEffect(() => { void load(); }, [load, arrived]);

  const patchLocal = (id: string, patch: Partial<FeedbackItem>) => {
    setItems((list) => {
      const next = list?.map((f) => (f.id === id ? { ...f, ...patch } : f)) ?? null;
      if (next) useFeedbackStore.getState().setUnread(next.filter((f) => !f.read_at).length);
      return next;
    });
  };

  const update = async (id: string, patch: admin.FeedbackPatch) => {
    const before = items?.find((f) => f.id === id);
    patchLocal(id, patch);
    try {
      await admin.updateFeedback(id, patch);
    } catch (err) {
      if (before) patchLocal(id, before);
      setError(err instanceof Error ? err.message : 'Couldn’t save that change.');
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this report for good?')) return;
    try {
      await admin.deleteFeedback(id);
      setItems((list) => {
        const next = list?.filter((f) => f.id !== id) ?? null;
        if (next) useFeedbackStore.getState().setUnread(next.filter((f) => !f.read_at).length);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t delete it.');
    }
  };

  const readAll = async () => {
    try {
      await admin.markAllRead();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t mark them read.');
    }
  };

  const signOut = async () => {
    try { await admin.signOut(); } catch { /* signed out locally either way */ }
    useFeedbackStore.getState().setAdmin('signed-out');
    onClose();
  };

  const counts = useMemo(() => {
    const all = items ?? [];
    return {
      all: all.length,
      unread: all.filter((f) => !f.read_at).length,
      openBugs: all.filter((f) => f.kind === 'bug' && OPEN.includes(f.status)).length,
      kind: Object.fromEntries(FEEDBACK_KINDS.map((k) => [k, all.filter((f) => f.kind === k).length])) as Record<FeedbackKind, number>,
    };
  }, [items]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((f) =>
      (kind === 'all' || f.kind === kind)
      && (status === 'all' || (status === 'open' ? OPEN.includes(f.status) : f.status === status))
      && (!unreadOnly || !f.read_at)
      && (!q || [f.message, f.contact, f.admin_note, f.context?.page].some((v) => v?.toLowerCase().includes(q))));
  }, [items, kind, status, unreadOnly, query]);

  const download = () => {
    const blob = new Blob([toCsv(shown)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cardiosim-feedback-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const chip = (on: boolean) => `px-2.5 py-1 rounded-full border text-xs transition-colors ${on ? 'bg-cardiac-accent/20 border-cardiac-accent/60 text-cardiac-accent font-semibold' : 'border-slate-600 text-slate-300 hover:bg-cardiac-surface'}`;

  return (
    <>
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-slate-700">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-white">Feedback dashboard</h2>
          <p className="text-[11px] text-slate-400 truncate">Signed in as {email ?? 'admin'}</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="p-2 rounded-lg text-slate-300 hover:bg-cardiac-surface disabled:opacity-50" aria-label="Refresh" title="Refresh">
          <IconRotate size={16} className={loading ? 'animate-spin' : ''} />
        </button>
        <button type="button" onClick={download} disabled={!shown.length} className="p-2 rounded-lg text-slate-300 hover:bg-cardiac-surface disabled:opacity-50" aria-label="Download as a spreadsheet (CSV)" title="Download the reports shown (CSV)">
          <IconDownload size={16} />
        </button>
        <button type="button" onClick={() => void signOut()} className="px-2.5 py-1.5 rounded-lg border border-slate-600 text-xs text-slate-200 hover:bg-cardiac-surface">Sign out</button>
        <button type="button" onClick={onClose} className="p-1 touch:p-2 text-slate-400 hover:text-white" aria-label="Close the dashboard"><IconClose size={16} /></button>
      </div>

      <div className="shrink-0 px-4 py-3 border-b border-slate-700 space-y-2.5">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Reports" value={counts.all} />
          <Stat label="Unread" value={counts.unread} tone={counts.unread ? 'text-emerald-300' : undefined} />
          <Stat label="Open bugs" value={counts.openBugs} tone={counts.openBugs ? 'text-rose-300' : undefined} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Kind">
          <button type="button" className={chip(kind === 'all')} aria-pressed={kind === 'all'} onClick={() => setKind('all')}>All {counts.all}</button>
          {FEEDBACK_KINDS.map((k) => (
            <button key={k} type="button" className={chip(kind === k)} aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND_LABELS[k].label} {counts.kind[k]}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Status" className="h-8 rounded-lg bg-cardiac-dark border border-slate-600 px-2 text-xs text-white">
            <option value="open">Open (new, planned, in progress)</option>
            <option value="all">Every status</option>
            {FEEDBACK_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-slate-300">
            <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} className="accent-amber-500" />Unread only
          </label>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reports"
            aria-label="Search reports"
            className="h-8 flex-1 min-w-[8rem] rounded-lg bg-cardiac-dark border border-slate-600 px-2 text-xs text-white placeholder:text-slate-500"
          />
          {counts.unread > 0 && (
            <button type="button" onClick={() => void readAll()} className="h-8 px-2.5 rounded-lg border border-slate-600 text-xs text-slate-200 hover:bg-cardiac-surface">Mark all read</button>
          )}
        </div>
        {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-2.5">
        {items === null && !error && <p className="text-sm text-slate-400">Loading…</p>}
        {items !== null && shown.length === 0 && (
          <p className="text-sm text-slate-400">{items.length ? 'Nothing matches these filters.' : 'No feedback yet. It will show up here — and you will get an alert — as soon as someone sends some.'}</p>
        )}
        {shown.map((f) => (
          <Report key={f.id} item={f} onUpdate={(patch) => void update(f.id, patch)} onDelete={() => void remove(f.id)} />
        ))}
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg bg-cardiac-dark/60 border border-slate-700 py-1.5">
      <div className={`text-lg font-semibold ${tone ?? 'text-white'}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
    </div>
  );
}

function Report({ item, onUpdate, onDelete }: { item: FeedbackItem; onUpdate: (patch: admin.FeedbackPatch) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(!item.read_at);
  const [note, setNote] = useState(item.admin_note ?? '');
  useEffect(() => { setNote(item.admin_note ?? ''); }, [item.admin_note]);
  const unread = !item.read_at;
  const ctx = item.context ?? ({} as FeedbackItem['context']);
  const noteChanged = note.trim() !== (item.admin_note ?? '');

  return (
    <article className={`rounded-xl border p-3 ${unread ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-700 bg-cardiac-dark/40'}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full text-left">
        <span className="flex flex-wrap items-center gap-2">
          {unread && <span className="w-2 h-2 rounded-full bg-emerald-400" aria-label="Unread" />}
          <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${KIND_BADGE[item.kind] ?? ''}`}>{KIND_LABELS[item.kind]?.label ?? item.kind}</span>
          <span className={`text-[11px] font-semibold ${STATUS_BADGE[item.status] ?? ''}`}>{STATUS_LABELS[item.status] ?? item.status}</span>
          <span className="ml-auto text-[11px] text-slate-500" title={new Date(item.created_at).toLocaleString()}>{timeAgo(item.created_at)}</span>
        </span>
        <span className={`block mt-1.5 text-sm text-slate-100 whitespace-pre-wrap break-words ${open ? '' : 'line-clamp-2'}`}>{item.message}</span>
      </button>

      {open && (
        <div className="mt-2.5 space-y-2.5">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
            {item.contact && (<><dt className="text-slate-500">Reply to</dt><dd><a href={`mailto:${item.contact}?subject=${encodeURIComponent('Your CardioSim feedback')}`} className="text-sky-300 hover:underline break-all">{item.contact}</a></dd></>)}
            <dt className="text-slate-500">Page</dt><dd className="text-slate-300">{ctx.page || '—'}</dd>
            <dt className="text-slate-500">Role</dt><dd className="text-slate-300">{ctx.role || '—'}</dd>
            <dt className="text-slate-500">Device</dt><dd className="text-slate-300">{[ctx.device, ctx.screen].filter(Boolean).join(' · ') || '—'}</dd>
            <dt className="text-slate-500">Version</dt><dd className="text-slate-300">{ctx.build || '—'}</dd>
            <dt className="text-slate-500">Browser</dt><dd className="text-slate-400 break-words">{ctx.userAgent || '—'}</dd>
            <dt className="text-slate-500">Sent</dt><dd className="text-slate-400">{new Date(item.created_at).toLocaleString()}</dd>
          </dl>

          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">Your note (only you see it)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={4000}
              className="w-full rounded-lg bg-cardiac-dark border border-slate-600 focus:border-cardiac-accent outline-none p-2 text-xs text-white"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={item.status}
              onChange={(e) => onUpdate({ status: e.target.value as FeedbackStatus, read_at: item.read_at ?? new Date().toISOString() })}
              aria-label="Status"
              className="h-8 rounded-lg bg-cardiac-dark border border-slate-600 px-2 text-xs text-white"
            >
              {FEEDBACK_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
            <button type="button" onClick={() => onUpdate({ read_at: unread ? new Date().toISOString() : null })} className="h-8 px-2.5 rounded-lg border border-slate-600 text-xs text-slate-200 hover:bg-cardiac-surface">
              {unread ? 'Mark read' : 'Mark unread'}
            </button>
            {noteChanged && (
              <button type="button" onClick={() => onUpdate({ admin_note: note.trim() || null })} className="h-8 px-2.5 rounded-lg bg-cardiac-accent text-slate-950 text-xs font-semibold">Save note</button>
            )}
            <button type="button" onClick={onDelete} className="ml-auto h-8 px-2.5 rounded-lg border border-rose-500/50 text-xs text-rose-300 hover:bg-rose-500/10">Delete</button>
          </div>
        </div>
      )}
    </article>
  );
}
