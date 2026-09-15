'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { EDITABLE_KEYS, defaultFieldsFor, sanitiseOverrides } from '@/lib/ratios/editableThresholds';
import type { SettingsActionState } from '@/lib/settings/state';

/**
 * Saves the household's threshold overrides.
 *
 * Only the fields that actually differ from the app's own defaults are stored,
 * so the row stays sparse: a number left alone keeps following the default
 * rather than being frozen at whatever today's default happens to be. That
 * matters because these defaults are the app's opinion and may be revised.
 *
 * Nothing takes effect until the next evaluation — the nightly run, or an
 * on-demand analysis. Saying so is the form's job; silently implying that a
 * stored signal has changed would be worse than the "app default" label this
 * replaces.
 */
export async function saveThresholds(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 'error', message: 'not_signed_in' };

  // Fields arrive as "evEbit.green"; anything else is not from this form.
  const submitted: Record<string, Record<string, string>> = {};
  for (const [name, value] of formData.entries()) {
    const [key, field] = String(name).split('.');
    if (!key || !field || typeof value !== 'string' || value.trim() === '') continue;
    (submitted[key] ??= {})[field] = value;
  }

  const { overrides, rejected } = sanitiseOverrides(submitted);
  if (rejected.some((r) => r.reason === 'not_a_number')) {
    return { status: 'error', message: 'threshold_value' };
  }

  // Keep only what differs, so "reset" is simply clearing the field.
  const sparse: Record<string, Record<string, number>> = {};
  for (const key of EDITABLE_KEYS) {
    const defaults = defaultFieldsFor(key);
    const group = overrides[key] ?? {};
    const changed = Object.fromEntries(
      Object.entries(group).filter(([field, value]) => defaults[field] !== value),
    );
    if (Object.keys(changed).length > 0) sparse[key] = changed;
  }

  const { error } = await supabase
    .from('analysis_settings')
    .upsert(
      { only_row: true, thresholds: sparse, updated_by: user.id },
      { onConflict: 'only_row' },
    );
  if (error) return { status: 'error', message: error.message };

  revalidatePath('/account');
  revalidatePath('/', 'layout');
  return { status: 'saved' };
}
