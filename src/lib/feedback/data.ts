'use client';

// Feedback submit — client-side. Any signed-in user can send feedback; RLS
// (feedback_insert_self) enforces that user_id must be their own and the row
// lands as status='new', un-triaged. The admin inbox reads live in
// src/lib/feedback/server.ts.
//
// MODERATION NOTE: like other public UGC text (profiles, fantasy team names),
// the profanity filter here is a CLIENT-side nicety only — a determined user
// could POST raw REST and bypass it. Accepted for now, same backstop story as
// the rest of the app. See the moderation-backstop memory. Feedback is admin-
// only-visible, so the blast radius is smaller than public UGC.

import { createClient } from '@/lib/supabase/client';
import { moderateName } from '@/lib/moderation';

export const FEEDBACK_CATEGORIES = ['Bug', 'Idea', 'Other'] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

const MAX_LEN = 4000;

export interface SubmitFeedbackInput {
  message: string;
  category?: FeedbackCategory;
  /** Path the user was on when they opened the form (display context only). */
  pagePath?: string;
}

/** Submits feedback for the current user. Returns an error string on failure
 *  (validation or transport), or null on success. */
export async function submitFeedback(input: SubmitFeedbackInput): Promise<string | null> {
  const message = input.message.trim();
  if (!message) return 'Please enter a message.';
  if (message.length > MAX_LEN) return `Please keep it under ${MAX_LEN} characters.`;

  const profanity = moderateName(message, 'Feedback');
  if (profanity) return profanity;

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return 'Please sign in to send feedback.';

  const { error } = await supabase.from('feedback').insert({
    user_id: uid,
    message,
    category: input.category ?? null,
    page_path: input.pagePath ?? null,
  });
  if (error) return 'Could not send your feedback. Please try again.';
  return null;
}
