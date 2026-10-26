/**
 * Feedback from learners: bug reports, improvements and feature ideas.
 *
 * Reports go straight to the `cardiac_feedback` table in Supabase through its REST API with the
 * publishable (browser-safe) key: the table's row-level security lets anyone add a report and
 * only a CardioSim admin read, change or delete one (see `admin.ts`). No account is needed to send.
 *
 * Each report carries its own id, so a send retried after a dropped connection can't arrive twice
 * (the second copy is refused as a duplicate, which counts as delivered). A report that can't go
 * out now — offline, or the server is busy — waits on the device and goes with the next flush
 * (app start, back online, or the next report).
 */

export type FeedbackKind = 'bug' | 'improvement' | 'feature';
export type FeedbackStatus = 'new' | 'planned' | 'in_progress' | 'done' | 'wont_fix';

export const FEEDBACK_KINDS: FeedbackKind[] = ['bug', 'improvement', 'feature'];
export const FEEDBACK_STATUSES: FeedbackStatus[] = ['new', 'planned', 'in_progress', 'done', 'wont_fix'];

export const KIND_LABELS: Record<FeedbackKind, { label: string; prompt: string }> = {
  bug: { label: 'Bug', prompt: 'What went wrong? What did you do just before, and what did you expect to happen?' },
  improvement: { label: 'Improvement', prompt: 'What could work better, and how?' },
  feature: { label: 'Feature idea', prompt: 'What would you like CardioSim to do?' },
};

export const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: 'New',
  planned: 'Planned',
  in_progress: 'In progress',
  done: 'Done',
  wont_fix: 'Won’t fix',
};

/** Limits shared with the database's check constraints */
export const MESSAGE_MIN = 5;
export const MESSAGE_MAX = 4000;
export const CONTACT_MAX = 200;
const CONTEXT_FIELD_MAX = 300;

/** What the app attaches to a report so it can be acted on: where the learner was and on what */
export interface FeedbackContext {
  /** e.g. "Learn › Conditions › Anterior STEMI" */
  page: string;
  role: string;
  /** "phone" | "tablet" | "desktop", plus "installed" when running as the installed app */
  device: string;
  /** viewport, e.g. "412×860" */
  screen: string;
  build: string;
  userAgent: string;
  language: string;
  /** when the learner pressed Send (ISO) — the server stamps its own arrival time */
  sentAt: string;
}

export interface FeedbackDraft {
  kind: FeedbackKind | null;
  message: string;
  contact: string;
}

export interface FeedbackReport {
  id: string;
  kind: FeedbackKind;
  message: string;
  contact: string | null;
  context: FeedbackContext;
}

/** A report as an admin sees it */
export interface FeedbackItem extends FeedbackReport {
  created_at: string;
  updated_at: string;
  status: FeedbackStatus;
  read_at: string | null;
  admin_note: string | null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Why the draft can't be sent yet, or null when it can */
export function validateFeedback(draft: FeedbackDraft): string | null {
  if (!draft.kind) return 'Choose what kind of feedback this is.';
  const message = draft.message.trim();
  if (message.length < MESSAGE_MIN) return 'Please write a little more.';
  if (message.length > MESSAGE_MAX) return `Please keep it under ${MESSAGE_MAX.toLocaleString('en-US')} characters.`;
  const contact = draft.contact.trim();
  if (contact && (contact.length > CONTACT_MAX || !EMAIL.test(contact))) return 'That email address doesn’t look right (or leave it empty).';
  return null;
}

export function newReportId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // RFC 4122 v4 from getRandomValues (older Safari), else Math.random
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const clip = (s: string, n = CONTEXT_FIELD_MAX) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** A ready-to-send report from a valid draft (call validateFeedback first) */
export function makeReport(draft: FeedbackDraft, context: FeedbackContext, id = newReportId()): FeedbackReport {
  if (!draft.kind) throw new Error('feedback kind missing');
  const contact = draft.contact.trim();
  const ctx = Object.fromEntries(Object.entries(context).map(([k, v]) => [k, clip(String(v))])) as unknown as FeedbackContext;
  return { id, kind: draft.kind, message: draft.message.trim().slice(0, MESSAGE_MAX), contact: contact ? contact.slice(0, CONTACT_MAX) : null, context: ctx };
}

// ─── For the admin ─────────────────────────────────────────────────────────

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** The reports as a spreadsheet (CSV) */
export function toCsv(items: FeedbackItem[]): string {
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['created', 'kind', 'status', 'read', 'message', 'contact', 'page', 'role', 'device', 'screen', 'build', 'note'];
  const rows = items.map((f) => [
    f.created_at, KIND_LABELS[f.kind]?.label ?? f.kind, STATUS_LABELS[f.status] ?? f.status, f.read_at ? 'yes' : 'no', f.message, f.contact,
    f.context?.page, f.context?.role, f.context?.device, f.context?.screen, f.context?.build, f.admin_note,
  ].map(cell).join(','));
  return [head.join(','), ...rows].join('\r\n');
}

// ─── Sending ───────────────────────────────────────────────────────────────

export interface Backend {
  url: string;
  key: string;
}

/** The Supabase project the reports go to, or null when this build has none (local dev, tests) */
export function feedbackBackend(): Backend | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url: url.replace(/\/+$/, ''), key } : null;
}

/** delivered · try again later · refused for good (with the reason) */
export type PostResult = { ok: true } | { ok: false; retry: true; reason: string } | { ok: false; retry: false; reason: string };

export async function postReport(report: FeedbackReport, backend: Backend, fetchImpl: typeof fetch = fetch): Promise<PostResult> {
  let res: Response;
  try {
    res = await fetchImpl(`${backend.url}/rest/v1/cardiac_feedback`, {
      method: 'POST',
      headers: { apikey: backend.key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(report),
    });
  } catch {
    return { ok: false, retry: true, reason: 'No connection.' };
  }
  if (res.ok) return { ok: true };
  let body: { code?: string; message?: string } = {};
  try { body = await res.json(); } catch { /* not JSON */ }
  // already arrived on an earlier try
  if (res.status === 409 || body.code === '23505') return { ok: true };
  // the database's flood guard: everyone together sent too much in the last few minutes
  if (body.code === 'P0001') return { ok: false, retry: true, reason: body.message || 'The server is busy.' };
  if (res.status >= 500 || res.status === 408 || res.status === 429) return { ok: false, retry: true, reason: 'The server is busy.' };
  return { ok: false, retry: false, reason: body.message || `Refused (${res.status}).` };
}

// ─── Waiting on the device ─────────────────────────────────────────────────

export const QUEUE_KEY = 'cardiosim.feedback.queue';
const QUEUE_MAX = 20;

export type KeyValue = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function loadQueue(storage: KeyValue | null): FeedbackReport[] {
  if (!storage) return [];
  try {
    const q = JSON.parse(storage.getItem(QUEUE_KEY) || '[]');
    return Array.isArray(q) ? q.filter((r) => r && typeof r.id === 'string' && typeof r.message === 'string') : [];
  } catch {
    return [];
  }
}

export function saveQueue(storage: KeyValue | null, queue: FeedbackReport[]) {
  if (!storage) return;
  try {
    if (queue.length) storage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-QUEUE_MAX)));
    else storage.removeItem(QUEUE_KEY);
  } catch { /* storage full or blocked: the report is lost only if the send also failed */ }
}

export interface SendDeps {
  backend: Backend | null;
  storage: KeyValue | null;
  fetch?: typeof fetch;
  online?: boolean;
}

export type SubmitResult = { status: 'sent' } | { status: 'queued'; reason: string } | { status: 'error'; reason: string };

/** Send a report now, or keep it on the device to send later */
export async function submitReport(report: FeedbackReport, deps: SendDeps): Promise<SubmitResult> {
  const enqueue = (reason: string): SubmitResult => {
    saveQueue(deps.storage, [...loadQueue(deps.storage).filter((r) => r.id !== report.id), report]);
    return { status: 'queued', reason };
  };
  if (!deps.backend) return enqueue('Feedback isn’t switched on in this version yet.');
  if (deps.online === false) return enqueue('You’re offline.');
  const res = await postReport(report, deps.backend, deps.fetch);
  if (res.ok) {
    // anything still waiting goes too
    void flushQueue(deps);
    return { status: 'sent' };
  }
  return res.retry ? enqueue(res.reason) : { status: 'error', reason: res.reason };
}

let flushing: Promise<number> | null = null;

/** Send every report waiting on the device; returns how many went. Refused ones are dropped. */
export function flushQueue(deps: SendDeps): Promise<number> {
  if (flushing) return flushing;
  flushing = (async () => {
    if (!deps.backend || deps.online === false) return 0;
    let sent = 0;
    for (const report of loadQueue(deps.storage)) {
      const res = await postReport(report, deps.backend, deps.fetch);
      if (!res.ok && res.retry) break; // still offline or busy: keep the rest for next time
      saveQueue(deps.storage, loadQueue(deps.storage).filter((r) => r.id !== report.id));
      if (res.ok) sent += 1;
    }
    return sent;
  })().finally(() => { flushing = null; });
  return flushing;
}

/** The browser's own storage, network and backend */
export function browserDeps(): SendDeps {
  let storage: KeyValue | null = null;
  try { storage = window.localStorage; } catch { /* blocked */ }
  return { backend: feedbackBackend(), storage, online: typeof navigator === 'undefined' ? undefined : navigator.onLine };
}
