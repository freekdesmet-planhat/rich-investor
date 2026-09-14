/**
 * Where sign-in sends you afterwards.
 *
 * The value comes from a querystring the middleware wrote but anyone can edit,
 * so the interesting cases are the ones that look like a path and are not.
 */
import { describe, expect, it } from 'vitest';
import { safeReturnTo } from './returnTo';

describe('safeReturnTo', () => {
  it('keeps a path on this site', () => {
    expect(safeReturnTo('/stock/ADYEN.AS')).toBe('/stock/ADYEN.AS');
    expect(safeReturnTo('/?status=buy_worthy&sort=drawdown')).toBe('/?status=buy_worthy&sort=drawdown');
  });

  it('falls back when there is nothing to go back to', () => {
    expect(safeReturnTo(null)).toBe('/');
    expect(safeReturnTo(undefined)).toBe('/');
    expect(safeReturnTo('')).toBe('/');
    expect(safeReturnTo('   ')).toBe('/');
  });

  it('refuses an absolute URL to another site', () => {
    expect(safeReturnTo('https://evil.example/login')).toBe('/');
    expect(safeReturnTo('http://evil.example')).toBe('/');
  });

  /**
   * The one that looks like a path: a protocol-relative URL starts with a
   * slash and still goes to another origin.
   */
  it('refuses a protocol-relative URL despite the leading slash', () => {
    expect(safeReturnTo('//evil.example/phish')).toBe('/');
    expect(safeReturnTo('/\\evil.example')).toBe('/');
  });

  it('refuses to send you back to the sign-in page', () => {
    expect(safeReturnTo('/login')).toBe('/');
    expect(safeReturnTo('/login?next=/login')).toBe('/');
  });

  it('honours a caller-supplied fallback', () => {
    expect(safeReturnTo(null, '/suggestions')).toBe('/suggestions');
  });
});
