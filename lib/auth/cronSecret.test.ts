/**
 * The shared secret guarding the scheduled endpoints.
 *
 * These jobs send email and spend API budget, and there is no session behind
 * them — the secret is the whole boundary, so the interesting cases are the
 * ones where it is absent, partially right, or the wrong length.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { isAuthorisedCron, timingSafeEqual } from './cronSecret';

const headers = (init: Record<string, string>) => new Headers(init);
const original = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = 'a-long-shared-secret';
});

afterEach(() => {
  if (original === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = original;
});

describe('timingSafeEqual', () => {
  it('matches identical strings', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
  });

  it('rejects a difference anywhere in the string', () => {
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'xbc')).toBe(false);
  });

  it('rejects a different length without indexing past the end', () => {
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('', 'a')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(true);
  });
});

describe('isAuthorisedCron', () => {
  it('accepts a bearer token', () => {
    expect(isAuthorisedCron(headers({ authorization: 'Bearer a-long-shared-secret' }))).toBe(true);
  });

  it('accepts the header form some schedulers send instead', () => {
    expect(isAuthorisedCron(headers({ 'x-cron-secret': 'a-long-shared-secret' }))).toBe(true);
  });

  it('is case-insensitive about the word Bearer, as the header is', () => {
    expect(isAuthorisedCron(headers({ authorization: 'bearer a-long-shared-secret' }))).toBe(true);
  });

  it('refuses the wrong secret', () => {
    expect(isAuthorisedCron(headers({ authorization: 'Bearer wrong' }))).toBe(false);
    expect(isAuthorisedCron(headers({ 'x-cron-secret': 'a-long-shared-secre' }))).toBe(false);
  });

  it('refuses a request carrying nothing', () => {
    expect(isAuthorisedCron(headers({}))).toBe(false);
  });

  /**
   * The one that matters most: an unconfigured deployment must be closed. An
   * endpoint that sends email should never be reachable because a variable is
   * missing.
   */
  it('is closed when no secret is configured, not open', () => {
    delete process.env.CRON_SECRET;
    expect(isAuthorisedCron(headers({ authorization: 'Bearer anything' }))).toBe(false);
    expect(isAuthorisedCron(headers({}))).toBe(false);
    // Not even an empty secret matching an empty header.
    expect(isAuthorisedCron(headers({ 'x-cron-secret': '' }))).toBe(false);
  });

  it('is closed when the secret is configured empty', () => {
    process.env.CRON_SECRET = '';
    expect(isAuthorisedCron(headers({ 'x-cron-secret': '' }))).toBe(false);
  });
});
