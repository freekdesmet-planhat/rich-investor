/**
 * What a decision on a suggestion reports back.
 *
 * Kept out of the `'use server'` module: such a module may only export async
 * functions, and exporting a constant from one turns it into a server-function
 * reference that React then refuses to evaluate during render.
 */
export interface SuggestionActionState {
  status: 'idle' | 'accepted' | 'dismissed' | 'restored' | 'error';
  symbol?: string;
  /** Days the dismissal will run for, so the undo can say what it is undoing. */
  days?: number;
  message?: string;
}

export const SUGGESTION_IDLE: SuggestionActionState = { status: 'idle' };
