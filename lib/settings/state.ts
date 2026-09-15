/**
 * What a settings form is told about the save it just made.
 *
 * Kept out of the `'use server'` module, which may only export async functions.
 */
export interface SettingsActionState {
  status: 'idle' | 'saved' | 'error';
  message?: string;
}

export const SETTINGS_IDLE: SettingsActionState = { status: 'idle' };
