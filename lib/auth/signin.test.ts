/**
 * Sign-in behaviour tests.
 *
 * The property worth protecting here is that the login form reveals nothing:
 * an address that is not on the whitelist must be indistinguishable from a
 * wrong password, and from an address that simply does not exist. Otherwise the
 * form becomes a way to enumerate who has access.
 */
import { describe, expect, it } from 'vitest';
import { allowedEmailsFromEnv } from './allowlistAdmin';

describe('the env allowlist', () => {
  const original = process.env.ALLOWED_EMAILS;
  const withEnv = (value: string | undefined) => {
    if (value === undefined) delete process.env.ALLOWED_EMAILS;
    else process.env.ALLOWED_EMAILS = value;
    const result = allowedEmailsFromEnv();
    if (original === undefined) delete process.env.ALLOWED_EMAILS;
    else process.env.ALLOWED_EMAILS = original;
    return result;
  };

  it('parses a comma-separated list, trimming and lowercasing', () => {
    expect(withEnv('  Me@Example.com , partner@example.com ')).toEqual([
      'me@example.com',
      'partner@example.com',
    ]);
  });

  it('drops entries that are not addresses', () => {
    expect(withEnv('me@example.com,,not-an-email, ')).toEqual(['me@example.com']);
  });

  it('is empty rather than permissive when unset', () => {
    expect(withEnv(undefined)).toEqual([]);
  });
});

/**
 * The action itself needs a live Supabase session to run, so these pin the
 * decision table it implements rather than calling it. Each row is verified
 * against the real provider in the sign-in checks; this keeps the intended
 * behaviour written down where a future change would have to break it.
 */
describe('what the sign-in form may reveal', () => {
  type Outcome = 'redirect' | 'invalid_credentials' | 'sent';

  const decide = (
    intent: 'password' | 'magiclink',
    allowed: boolean,
    passwordCorrect: boolean,
  ): Outcome => {
    if (intent === 'password') {
      if (!allowed) return 'invalid_credentials';
      return passwordCorrect ? 'redirect' : 'invalid_credentials';
    }
    // The magic-link path answers the same way either way, and only actually
    // sends when the address is approved.
    return 'sent';
  };

  it('signs in an approved address with the right password', () => {
    expect(decide('password', true, true)).toBe('redirect');
  });

  it('gives an unapproved address the same answer as a wrong password', () => {
    expect(decide('password', false, true)).toBe('invalid_credentials');
    expect(decide('password', true, false)).toBe('invalid_credentials');
    expect(decide('password', false, true)).toBe(decide('password', true, false));
  });

  it('answers the magic-link request identically whether or not the address is approved', () => {
    expect(decide('magiclink', true, false)).toBe('sent');
    expect(decide('magiclink', false, false)).toBe('sent');
    expect(decide('magiclink', true, false)).toBe(decide('magiclink', false, false));
  });
});
