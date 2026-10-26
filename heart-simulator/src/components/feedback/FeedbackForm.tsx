'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFeedbackStore } from '@/store/useFeedbackStore';
import {
  FEEDBACK_KINDS, KIND_LABELS, MESSAGE_MAX, browserDeps, makeReport, submitReport, validateFeedback, type FeedbackKind,
} from '@/lib/feedback/feedback';
import { feedbackContext } from '@/lib/feedback/context';
import { IconCheck, IconClose } from '@/components/ui/icons';

const KIND_HINT: Record<FeedbackKind, string> = {
  bug: 'Something is broken or wrong',
  improvement: 'Make something work better',
  feature: 'Something new CardioSim could do',
};

const KIND_TINT: Record<FeedbackKind, string> = {
  bug: 'border-rose-400/70 bg-rose-500/15 text-rose-200',
  improvement: 'border-sky-400/70 bg-sky-500/15 text-sky-200',
  feature: 'border-amber-400/70 bg-amber-500/15 text-amber-200',
};

type Phase = { step: 'edit'; error?: string } | { step: 'sending' } | { step: 'sent' } | { step: 'queued'; reason: string };

/** Bug reports, improvements and feature ideas from anyone — no account needed */
export default function FeedbackForm() {
  const open = useFeedbackStore((s) => s.formOpen);
  if (!open) return null;
  return <Form />;
}

function Form() {
  const fb = useFeedbackStore();
  const [phase, setPhase] = useState<Phase>({ step: 'edit' });
  // a field only bots fill in
  const [trap, setTrap] = useState('');
  const firstRef = useRef<HTMLButtonElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const close = () => fb.setFormOpen(false);
  // what goes with the report, shown so the learner knows (the page behind the form doesn't change while it is open)
  const context = useMemo(() => feedbackContext(), []);

  useEffect(() => {
    (fb.draftKind ? messageRef.current : firstRef.current)?.focus();
    // only when the form opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draft = { kind: fb.draftKind, message: fb.draftMessage, contact: fb.draftContact };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phase.step === 'sending') return;
    const error = validateFeedback(draft);
    if (error) { setPhase({ step: 'edit', error }); return; }
    if (trap) { fb.clearDraft(); setPhase({ step: 'sent' }); return; }
    setPhase({ step: 'sending' });
    const report = makeReport(draft, { ...context, sentAt: new Date().toISOString() });
    const res = await submitReport(report, browserDeps());
    if (res.status === 'error') { setPhase({ step: 'edit', error: `It couldn’t be sent: ${res.reason}` }); return; }
    fb.clearDraft();
    setPhase(res.status === 'sent' ? { step: 'sent' } : { step: 'queued', reason: res.reason });
  };

  const done = phase.step === 'sent' || phase.step === 'queued';

  return (
    <div className="fixed inset-0 z-[65] bg-black/60 flex items-center justify-center p-4 phone:p-0" onClick={close} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        className="w-full max-w-lg max-h-[90dvh] overflow-y-auto bg-cardiac-panel border border-slate-600 rounded-xl shadow-2xl phone:max-w-none phone:h-full phone:max-h-none phone:rounded-none phone:border-0"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}
      >
        <div className="sticky top-0 z-10 bg-cardiac-panel flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 id="feedback-title" className="text-sm font-semibold text-white">Send feedback</h2>
          <button type="button" onClick={close} className="p-1 touch:p-2 text-slate-400 hover:text-white" aria-label="Close feedback"><IconClose size={16} /></button>
        </div>

        {done ? (
          <div className="p-6 text-center" role="status">
            <span className="mx-auto w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center"><IconCheck size={26} /></span>
            <p className="mt-3 text-base font-semibold text-white">{phase.step === 'sent' ? 'Thank you, it’s sent.' : 'Saved on this device.'}</p>
            <p className="mt-1 text-sm text-slate-300 leading-snug">
              {phase.step === 'sent'
                ? 'Every report is read. If you left an email, you may get a reply.'
                : `${phase.reason} It will be sent automatically the next time CardioSim is online.`}
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <button type="button" onClick={() => setPhase({ step: 'edit' })} className="px-4 py-2 rounded-lg border border-slate-600 text-sm text-slate-200 hover:bg-cardiac-surface">Send another</button>
              <button type="button" onClick={close} className="px-4 py-2 rounded-lg bg-cardiac-accent text-slate-950 text-sm font-semibold">Close</button>
            </div>
          </div>
        ) : (
          <form className="p-4 space-y-4" onSubmit={send} noValidate>
            <fieldset>
              <legend className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5">What is it?</legend>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Kind of feedback">
                {FEEDBACK_KINDS.map((k, i) => (
                  <button
                    key={k}
                    ref={i === 0 ? firstRef : undefined}
                    type="button"
                    role="radio"
                    aria-checked={fb.draftKind === k}
                    onClick={() => { fb.setDraft({ kind: k }); messageRef.current?.focus(); }}
                    className={`text-left p-2.5 rounded-lg border transition-colors ${fb.draftKind === k ? KIND_TINT[k] : 'border-slate-600 text-slate-200 hover:bg-cardiac-surface'}`}
                  >
                    <span className="block text-sm font-semibold">{KIND_LABELS[k].label}</span>
                    <span className="block mt-0.5 text-[11px] leading-snug text-slate-400">{KIND_HINT[k]}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="block">
              <span className="block text-[11px] uppercase tracking-wider text-slate-400 mb-1.5">
                {fb.draftKind ? KIND_LABELS[fb.draftKind].prompt : 'Tell us about it'}
              </span>
              <textarea
                ref={messageRef}
                value={fb.draftMessage}
                onChange={(e) => fb.setDraft({ message: e.target.value })}
                maxLength={MESSAGE_MAX}
                rows={6}
                className="w-full rounded-lg bg-cardiac-dark border border-slate-600 focus:border-cardiac-accent outline-none p-2.5 text-sm text-white placeholder:text-slate-500 resize-y"
                placeholder={fb.draftKind === 'bug' ? 'e.g. On the 12-lead, tapping V1 on my phone does nothing.' : 'Write as much as you like.'}
              />
              <span className="block text-right text-[10px] text-slate-500">{fb.draftMessage.length.toLocaleString('en-US')} / {MESSAGE_MAX.toLocaleString('en-US')}</span>
            </label>

            <label className="block">
              <span className="block text-[11px] uppercase tracking-wider text-slate-400 mb-1.5">Your email (optional, only if you’d like a reply)</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={fb.draftContact}
                onChange={(e) => fb.setDraft({ contact: e.target.value })}
                className="w-full h-10 rounded-lg bg-cardiac-dark border border-slate-600 focus:border-cardiac-accent outline-none px-2.5 text-sm text-white placeholder:text-slate-500"
                placeholder="you@example.com"
              />
            </label>

            {/* bots fill in every field; people never see this one */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={trap} onChange={(e) => setTrap(e.target.value)} className="absolute -left-[9999px] w-px h-px opacity-0" />

            <p className="text-[11px] text-slate-400 leading-snug">
              Sent with it, to help fix things: where you are (<span className="text-slate-300">{context.page}</span>), your role
              ({context.role}), your device ({context.device}, {context.screen}) and the app version. Nothing else about you.
            </p>

            {phase.step === 'edit' && phase.error && <p role="alert" className="text-sm text-rose-300">{phase.error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={close} className="px-4 py-2 rounded-lg border border-slate-600 text-sm text-slate-200 hover:bg-cardiac-surface">Cancel</button>
              <button type="submit" disabled={phase.step === 'sending'} className="px-5 py-2 rounded-lg bg-cardiac-accent text-slate-950 text-sm font-semibold disabled:opacity-60">
                {phase.step === 'sending' ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
