'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ASSESSMENTS, CATALYST_KEYS, SELL_SIGNAL_KEYS } from '@/lib/review/keys';



/**
 * Saves the signed-in member's own review.
 *
 * Reviews are per person: `user_id` is always auth.uid(), never taken from the
 * form, so one member cannot overwrite the other's judgement. RLS enforces the
 * same thing at the database; this makes it impossible to even ask for.
 */
export async function saveReview(formData: FormData): Promise<void> {
  const symbol = String(formData.get('symbol') ?? '');
  if (!symbol) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const rawAssessment = String(formData.get('assessment') ?? 'not_assessed');
  const assessment = (ASSESSMENTS as readonly string[]).includes(rawAssessment)
    ? rawAssessment
    : 'not_assessed';

  // Only keys we know about, so the form cannot write arbitrary values.
  const catalysts = formData
    .getAll('catalysts')
    .map(String)
    .filter((k) => (CATALYST_KEYS as readonly string[]).includes(k));

  const sellSignals = formData
    .getAll('sell_signals')
    .map(String)
    .filter((k) => (SELL_SIGNAL_KEYS as readonly string[]).includes(k));

  const marks = String(formData.get('marks_answer') ?? '').trim() || null;

  const { data: review, error } = await supabase
    .from('qualitative_reviews')
    .upsert(
      {
        user_id: user.id,
        symbol,
        assessment,
        catalysts,
        sell_signals: sellSignals,
        marks_answer: marks,
        assessed_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,symbol' },
    )
    .select('id')
    .single<{ id: string }>();

  if (error) throw new Error(error.message);

  // Notes are a running log with their own dates, not a single field, so a new
  // one is appended rather than replacing what came before.
  const note = String(formData.get('note') ?? '').trim();
  if (note && review) {
    const { error: noteError } = await supabase.from('qualitative_notes').insert({
      review_id: review.id,
      user_id: user.id,
      symbol,
      note,
    });
    if (noteError) throw new Error(noteError.message);
  }

  revalidatePath(`/stock/${symbol}`);
}
