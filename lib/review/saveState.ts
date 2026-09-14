/**
 * What the review form is told about the save it just made.
 *
 * The action used to return nothing and throw on failure, which meant a save
 * was indistinguishable from having done nothing: the page re-rendered with the
 * same values it already showed, and a database error became a crash screen.
 * Both are now answers the form can print.
 *
 * Kept out of the `'use server'` file for the same reason `keys.ts` is: such a
 * module may only export async functions, and exporting a constant from one
 * turns it into a server-function reference — which React then refuses to
 * evaluate during render, taking the whole page down with it.
 */
export type ReviewSaveState =
  | { status: 'idle' }
  | { status: 'saved'; at: string; noteAdded: boolean }
  | { status: 'error'; message: string };

export const REVIEW_IDLE: ReviewSaveState = { status: 'idle' };
