import { describe, expect, it, vi } from 'vitest';
import {
  CONTACT_MAX, MESSAGE_MAX, QUEUE_KEY, flushQueue, loadQueue, makeReport, newReportId, postReport, submitReport, timeAgo, toCsv, validateFeedback,
  type Backend, type FeedbackContext, type FeedbackItem, type FeedbackReport, type KeyValue,
} from '@/lib/feedback/feedback';

const CONTEXT: FeedbackContext = {
  page: 'Learn › Conditions › Anterior STEMI', role: 'Paramedic', device: 'phone', screen: '412×860',
  build: 'abc123', userAgent: 'test', language: 'en-US', sentAt: '2026-10-26T12:00:00.000Z',
};
const BACKEND: Backend = { url: 'https://example.supabase.co', key: 'sb_publishable_test' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function memory(): KeyValue & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
    removeItem: (k) => { delete data[k]; },
  };
}

const report = (message = 'The V1 lead does nothing when I tap it', id = newReportId()): FeedbackReport =>
  makeReport({ kind: 'bug', message, contact: '' }, CONTEXT, id);

const response = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('a feedback draft', () => {
  it('needs a kind and a few words', () => {
    expect(validateFeedback({ kind: null, message: 'Something broke', contact: '' })).toMatch(/kind/);
    expect(validateFeedback({ kind: 'bug', message: '  hi  ', contact: '' })).toMatch(/more/);
    expect(validateFeedback({ kind: 'feature', message: 'Add a pacing case', contact: '' })).toBeNull();
  });

  it('caps the length and checks an optional email', () => {
    expect(validateFeedback({ kind: 'bug', message: 'x'.repeat(MESSAGE_MAX + 1), contact: '' })).toMatch(/under/);
    expect(validateFeedback({ kind: 'bug', message: 'Broken button', contact: 'not an email' })).toMatch(/email/);
    expect(validateFeedback({ kind: 'bug', message: 'Broken button', contact: `${'a'.repeat(CONTACT_MAX)}@x.com` })).toMatch(/email/);
    expect(validateFeedback({ kind: 'bug', message: 'Broken button', contact: ' medic@example.org ' })).toBeNull();
  });

  it('becomes a report with its own id, trimmed text and no empty contact', () => {
    const r = makeReport({ kind: 'improvement', message: '  Bigger leads on phones  ', contact: '   ' }, { ...CONTEXT, userAgent: 'u'.repeat(1000) });
    expect(r.id).toMatch(UUID);
    expect(r.message).toBe('Bigger leads on phones');
    expect(r.contact).toBeNull();
    expect(r.context.userAgent.length).toBeLessThanOrEqual(300);
    expect(makeReport({ kind: 'bug', message: 'Broken', contact: ' a@b.co ' }, CONTEXT).contact).toBe('a@b.co');
  });

  it('ids are random v4 UUIDs', () => {
    const ids = new Set(Array.from({ length: 50 }, newReportId));
    expect(ids.size).toBe(50);
    ids.forEach((id) => expect(id).toMatch(UUID));
  });
});

describe('sending a report', () => {
  it('posts it to the feedback table with the publishable key, asking for nothing back', async () => {
    const fetch = vi.fn(async () => response(201));
    const r = report();
    expect(await postReport(r, BACKEND, fetch)).toEqual({ ok: true });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://example.supabase.co/rest/v1/cardiac_feedback');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ apikey: BACKEND.key, Prefer: 'return=minimal' });
    expect(JSON.parse(String(init.body))).toMatchObject({ id: r.id, kind: 'bug', message: r.message, context: { page: CONTEXT.page } });
  });

  it('counts a duplicate as delivered (an earlier try got through)', async () => {
    expect(await postReport(report(), BACKEND, async () => response(409, { code: '23505' }))).toEqual({ ok: true });
  });

  it('retries later when offline, busy or flood-guarded, and gives up on a refusal', async () => {
    const offline = await postReport(report(), BACKEND, async () => { throw new TypeError('Failed to fetch'); });
    expect(offline).toMatchObject({ ok: false, retry: true });
    expect(await postReport(report(), BACKEND, async () => response(503))).toMatchObject({ ok: false, retry: true });
    expect(await postReport(report(), BACKEND, async () => response(400, { code: 'P0001', message: 'Too much feedback right now.' })))
      .toEqual({ ok: false, retry: true, reason: 'Too much feedback right now.' });
    expect(await postReport(report(), BACKEND, async () => response(400, { code: '23514', message: 'violates check constraint' })))
      .toMatchObject({ ok: false, retry: false });
  });
});

describe('reports that can’t go now wait on the device', () => {
  it('without a backend or offline, the report is kept', async () => {
    const storage = memory();
    const r1 = report('First report text');
    expect((await submitReport(r1, { backend: null, storage })).status).toBe('queued');
    const r2 = report('Second report text');
    const fetch = vi.fn();
    expect((await submitReport(r2, { backend: BACKEND, storage, online: false, fetch })).status).toBe('queued');
    expect(fetch).not.toHaveBeenCalled();
    expect(loadQueue(storage).map((r) => r.id)).toEqual([r1.id, r2.id]);
  });

  it('a failed send is kept; a refused one is reported and not kept', async () => {
    const storage = memory();
    expect((await submitReport(report(), { backend: BACKEND, storage, fetch: async () => response(500) })).status).toBe('queued');
    const refused = await submitReport(report(), { backend: BACKEND, storage, fetch: async () => response(400, { message: 'bad' }) });
    expect(refused).toEqual({ status: 'error', reason: 'bad' });
    expect(loadQueue(storage)).toHaveLength(1);
  });

  it('flushing sends them in order, stops while still offline, and drops refused ones', async () => {
    const storage = memory();
    const [a, b, c] = [report('Report A text'), report('Report B text'), report('Report C text')];
    storage.setItem(QUEUE_KEY, JSON.stringify([a, b, c]));
    const sent: string[] = [];
    let calls = 0;
    const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      calls += 1;
      const id = JSON.parse(String(init?.body)).id;
      if (calls === 2) return response(400, { message: 'refused' }); // b is refused for good
      if (calls === 3) throw new TypeError('offline'); // c can't go yet
      sent.push(id);
      return response(201);
    });
    expect(await flushQueue({ backend: BACKEND, storage, fetch })).toBe(1);
    expect(sent).toEqual([a.id]);
    expect(loadQueue(storage).map((r) => r.id)).toEqual([c.id]);

    expect(await flushQueue({ backend: BACKEND, storage, fetch: async () => response(201) })).toBe(1);
    expect(storage.data[QUEUE_KEY]).toBeUndefined();
  });

  it('a successful send also sends whatever was waiting', async () => {
    const storage = memory();
    const waiting = report('Waiting report text');
    storage.setItem(QUEUE_KEY, JSON.stringify([waiting]));
    const bodies: string[] = [];
    const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => { bodies.push(JSON.parse(String(init?.body)).id); return response(201); });
    const now = report('New report text');
    expect((await submitReport(now, { backend: BACKEND, storage, fetch })).status).toBe('sent');
    await vi.waitFor(() => expect(loadQueue(storage)).toHaveLength(0));
    expect(bodies).toEqual([now.id, waiting.id]);
  });

  it('ignores a corrupt queue', () => {
    const storage = memory();
    storage.setItem(QUEUE_KEY, '{not json');
    expect(loadQueue(storage)).toEqual([]);
    storage.setItem(QUEUE_KEY, JSON.stringify([{ nope: 1 }, report()]));
    expect(loadQueue(storage)).toHaveLength(1);
  });
});

describe('the admin dashboard helpers', () => {
  it('says how long ago a report came', () => {
    const now = Date.parse('2026-10-26T12:00:00Z');
    expect(timeAgo('2026-10-26T11:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-10-26T11:45:00Z', now)).toBe('15 min ago');
    expect(timeAgo('2026-10-26T09:00:00Z', now)).toBe('3 h ago');
    expect(timeAgo('2026-10-25T12:00:00Z', now)).toBe('1 day ago');
    expect(timeAgo('2026-06-01T12:00:00Z', now)).toMatch(/2026/);
  });

  it('exports reports as a spreadsheet, quoting commas, quotes and line breaks', () => {
    const item: FeedbackItem = {
      ...report('Line one, with "quotes"\nline two'),
      created_at: '2026-10-26T12:00:00Z', updated_at: '2026-10-26T12:00:00Z', status: 'in_progress', read_at: null, admin_note: null,
    };
    const csv = toCsv([item]).split('\r\n');
    expect(csv[0]).toBe('created,kind,status,read,message,contact,page,role,device,screen,build,note');
    expect(csv[1]).toContain('Bug,In progress,no,"Line one, with ""quotes""\nline two",,Learn › Conditions › Anterior STEMI,Paramedic');
  });
});
