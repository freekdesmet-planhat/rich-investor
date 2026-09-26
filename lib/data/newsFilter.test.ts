import { describe, it, expect } from 'vitest';
import { isAnalystRatingHeadline } from './newsFilter';

describe('analyst rating / price-target headlines', () => {
  it('hides rating and price-target stories', () => {
    for (const title of [
      'Analyst raises Apple price target to $250',
      'Morgan Stanley upgrades Nvidia to Overweight',
      'Firm downgrades the stock to Hold',
      'Goldman reiterates Buy rating',
      'Analysts boost target after earnings',
      'Jefferies initiates coverage with Outperform',
    ]) {
      expect(isAnalystRatingHeadline(title)).toBe(true);
    }
  });

  it('keeps the company’s own news', () => {
    for (const title of [
      'Apple unveils new iPhone lineup',
      'Nvidia reports record data-centre revenue',
      'ASML signs supply agreement with TSMC',
      'CEO to step down next year',
    ]) {
      expect(isAnalystRatingHeadline(title)).toBe(false);
    }
  });

  it('is null-safe', () => {
    expect(isAnalystRatingHeadline(null)).toBe(false);
    expect(isAnalystRatingHeadline(undefined)).toBe(false);
  });
});
