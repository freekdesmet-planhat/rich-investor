import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { secConfigured, secHeaders, secUserAgent } from './secUserAgent';

const original = process.env.SEC_USER_AGENT;

describe('secUserAgent', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    if (original === undefined) delete process.env.SEC_USER_AGENT;
    else process.env.SEC_USER_AGENT = original;
    vi.restoreAllMocks();
  });

  it('reports the configured contact string', () => {
    process.env.SEC_USER_AGENT = 'rich-investor-app/0.1 (you@example.com)';
    expect(secUserAgent()).toBe('rich-investor-app/0.1 (you@example.com)');
    expect(secConfigured()).toBe(true);
    expect(secHeaders()['User-Agent']).toBe('rich-investor-app/0.1 (you@example.com)');
  });

  // The whole point of the rewrite: unset must be unset, not a plausible
  // string that EDGAR answers with a 403.
  it('has no fallback when unset', () => {
    delete process.env.SEC_USER_AGENT;
    expect(secUserAgent()).toBeNull();
    expect(secConfigured()).toBe(false);
    expect(() => secHeaders()).toThrow(/not configured/);
  });

  it('treats a blank string as unset', () => {
    process.env.SEC_USER_AGENT = '   ';
    expect(secConfigured()).toBe(false);
    expect(secUserAgent()).toBeNull();
  });
});
