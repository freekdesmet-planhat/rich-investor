/**
 * "Not signed in" versus "could not ask".
 *
 * The bug this guards: every failure of `getUser()` counted as a verdict, so a
 * blip during token rotation redirected a stock page to /login, and by the time
 * it arrived the cookie was good again and it was sent on to the watchlist.
 */
import { describe, expect, it } from 'vitest';
import { isDefinitelySignedOut } from './sessionVerdict';

describe('isDefinitelySignedOut', () => {
  it('is false when nothing went wrong', () => {
    expect(isDefinitelySignedOut(null)).toBe(false);
    expect(isDefinitelySignedOut(undefined)).toBe(false);
  });

  it('believes the auth server when it rejects the session', () => {
    expect(isDefinitelySignedOut({ status: 401 })).toBe(true);
    expect(isDefinitelySignedOut({ status: 403 })).toBe(true);
    expect(isDefinitelySignedOut({ status: 400 })).toBe(true);
    expect(isDefinitelySignedOut({ name: 'AuthSessionMissingError' })).toBe(true);
  });

  /** The whole point: these are unanswered questions, not answers. */
  it('does not read a server failure as a signed-out user', () => {
    expect(isDefinitelySignedOut({ status: 500 })).toBe(false);
    expect(isDefinitelySignedOut({ status: 502 })).toBe(false);
    expect(isDefinitelySignedOut({ status: 503 })).toBe(false);
    expect(isDefinitelySignedOut({ status: 504 })).toBe(false);
  });

  it('does not read a transport failure as a signed-out user', () => {
    // No status at all: DNS, a dropped socket, an abort, a timeout.
    expect(isDefinitelySignedOut({ name: 'TypeError' })).toBe(false);
    expect(isDefinitelySignedOut({ name: 'AbortError' })).toBe(false);
    expect(isDefinitelySignedOut({})).toBe(false);
  });
});
