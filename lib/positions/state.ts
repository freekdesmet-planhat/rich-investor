/**
 * What the position form is told about the save it just made.
 *
 * Kept out of the `'use server'` module, which may only export async functions
 * — exporting a constant from one turns it into a server-function reference
 * that React refuses to evaluate during render.
 */
export interface PositionActionState {
  status: 'idle' | 'saved' | 'cleared' | 'error';
  /** One of the reasons `parsePosition` gives, so the form can name the field. */
  reason?: string;
  message?: string;
}

export const POSITION_IDLE: PositionActionState = { status: 'idle' };
