/**
 * Scan control state.
 *
 * The cursor, its cost and the breaker now live in the `scan_cursor` table and
 * are claimed atomically in the database, so the interesting behaviour — no two
 * slices getting the same range — is a DB property, verified against a real
 * Postgres. What stays unit-testable is the breaker's read-side decision.
 */
import { describe, expect, it } from 'vitest';
import { isBreakerOpen } from './scanState';

describe('isBreakerOpen', () => {
  it('is open only when the breaker was tripped today', () => {
    expect(isBreakerOpen('2026-09-26', '2026-09-26')).toBe(true);
  });

  it('is closed on a new day, so each night starts fresh', () => {
    expect(isBreakerOpen('2026-09-25', '2026-09-26')).toBe(false);
  });

  it('is closed when it has never been tripped', () => {
    expect(isBreakerOpen(null, '2026-09-26')).toBe(false);
  });
});
