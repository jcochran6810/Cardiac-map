/**
 * The owner's admin side of feedback: sign in, read and triage reports.
 *
 * Signing in uses Supabase Auth (email + password). Being signed in is not enough: the account must
 * also be listed in `cardiac_admins`, which only the project owner can change (in SQL). Every read,
 * change and delete is checked again by the database's row-level security, so nothing here is a
 * security boundary — the database is.
 *
 * The Supabase client is loaded on demand: learners who never sign in never download it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { feedbackBackend, type FeedbackItem, type FeedbackStatus } from '@/lib/feedback/feedback';

/** where the signed-in session is kept on this device */
export const ADMIN_SESSION_KEY = 'cardiosim.admin.session';

let client: Promise<SupabaseClient> | null = null;

function getClient(): Promise<SupabaseClient> {
  const backend = feedbackBackend();
  if (!backend) return Promise.reject(new Error('Admin sign-in isn’t switched on in this version yet.'));
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(backend.url, backend.key, {
      auth: { storageKey: ADMIN_SESSION_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    }));
  return client;
}

/** Cheap check before loading anything: was an admin signed in on this device? */
export function hasStoredSession(): boolean {
  try { return !!window.localStorage.getItem(ADMIN_SESSION_KEY); } catch { return false; }
}

export class NotAdminError extends Error {
  constructor() { super('This account can’t see CardioSim feedback.'); }
}

async function isAdmin(sb: SupabaseClient, userId: string): Promise<boolean> {
  // row-level security returns the caller's own row, and only if they are an admin
  const { data, error } = await sb.from('cardiac_admins').select('user_id').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

/** Sign in; resolves with the admin's email, or rejects (wrong password, not an admin, offline) */
export async function signIn(email: string, password: string): Promise<string> {
  const sb = await getClient();
  const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error || !data.user) {
    throw new Error(error?.message === 'Invalid login credentials' ? 'Wrong email or password.' : error?.message || 'Couldn’t sign in.');
  }
  if (!(await isAdmin(sb, data.user.id))) {
    await sb.auth.signOut({ scope: 'local' });
    throw new NotAdminError();
  }
  return data.user.email ?? email.trim();
}

/** The admin still signed in on this device (after a reload), or null */
export async function restore(): Promise<string | null> {
  if (!hasStoredSession()) return null;
  const sb = await getClient();
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  if (!(await isAdmin(sb, user.id))) {
    await sb.auth.signOut({ scope: 'local' });
    return null;
  }
  return user.email ?? null;
}

export async function signOut(): Promise<void> {
  const sb = await getClient();
  await sb.auth.signOut({ scope: 'local' });
}

/** Call `cb` if the session ends by itself (expired, revoked, signed out in another tab); returns the clean-up */
export async function onSignedOut(cb: () => void): Promise<() => void> {
  const sb = await getClient();
  const { data } = sb.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') cb(); });
  return () => data.subscription.unsubscribe();
}

const COLUMNS = 'id, created_at, updated_at, kind, message, contact, context, status, read_at, admin_note';

/** Newest first */
export async function listFeedback(limit = 500): Promise<FeedbackItem[]> {
  const sb = await getClient();
  const { data, error } = await sb.from('cardiac_feedback').select(COLUMNS).order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as FeedbackItem[];
}

/** How many reports are unread, and the newest of them (for the alert) */
export async function unread(): Promise<{ count: number; newest: Pick<FeedbackItem, 'id' | 'kind' | 'message' | 'created_at'> | null }> {
  const sb = await getClient();
  const { data, count, error } = await sb.from('cardiac_feedback')
    .select('id, kind, message, created_at', { count: 'exact' })
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return { count: count ?? 0, newest: (data?.[0] as FeedbackItem | undefined) ?? null };
}

export type FeedbackPatch = Partial<{ status: FeedbackStatus; read_at: string | null; admin_note: string | null }>;

export async function updateFeedback(id: string, patch: FeedbackPatch): Promise<void> {
  const sb = await getClient();
  const { error } = await sb.from('cardiac_feedback').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function markAllRead(): Promise<void> {
  const sb = await getClient();
  const { error } = await sb.from('cardiac_feedback').update({ read_at: new Date().toISOString() }).is('read_at', null);
  if (error) throw new Error(error.message);
}

export async function deleteFeedback(id: string): Promise<void> {
  const sb = await getClient();
  const { error } = await sb.from('cardiac_feedback').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
