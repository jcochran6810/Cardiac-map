import { create } from 'zustand';
import type { FeedbackKind } from '@/lib/feedback/feedback';

export type AdminStatus = 'signed-out' | 'restoring' | 'signed-in';

export interface FeedbackAlert {
  id: string;
  kind: FeedbackKind;
  message: string;
}

interface FeedbackState {
  /** the Send feedback form */
  formOpen: boolean;
  /** what the learner has typed so far — kept if the form is closed before sending */
  draftKind: FeedbackKind | null;
  draftMessage: string;
  draftContact: string;
  /** the admin panel: the sign-in form, or the feedback dashboard once signed in */
  adminOpen: boolean;
  admin: AdminStatus;
  adminEmail: string | null;
  /** unread reports (signed-in admin only) */
  unread: number;
  /** a report arrived while the admin was using the app */
  alert: FeedbackAlert | null;

  openForm: (kind?: FeedbackKind) => void;
  setFormOpen: (open: boolean) => void;
  setDraft: (draft: Partial<{ kind: FeedbackKind | null; message: string; contact: string }>) => void;
  clearDraft: () => void;
  setAdminOpen: (open: boolean) => void;
  setAdmin: (admin: AdminStatus, email?: string | null) => void;
  setUnread: (unread: number) => void;
  setAlert: (alert: FeedbackAlert | null) => void;
}

export const useFeedbackStore = create<FeedbackState>((set) => ({
  formOpen: false,
  draftKind: null,
  draftMessage: '',
  draftContact: '',
  adminOpen: false,
  admin: 'signed-out',
  adminEmail: null,
  unread: 0,
  alert: null,

  openForm: (kind) => set((s) => ({ formOpen: true, draftKind: kind ?? s.draftKind })),
  setFormOpen: (formOpen) => set({ formOpen }),
  setDraft: (d) => set((s) => ({
    draftKind: d.kind !== undefined ? d.kind : s.draftKind,
    draftMessage: d.message ?? s.draftMessage,
    draftContact: d.contact ?? s.draftContact,
  })),
  clearDraft: () => set({ draftKind: null, draftMessage: '' }), // the reply-to email is kept for next time
  setAdminOpen: (adminOpen) => set({ adminOpen }),
  setAdmin: (admin, email) => set(admin === 'signed-in'
    ? { admin, adminEmail: email ?? null }
    : { admin, adminEmail: null, unread: 0, alert: null }),
  setUnread: (unread) => set({ unread }),
  setAlert: (alert) => set({ alert }),
}));
