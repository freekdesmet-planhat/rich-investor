import { describe, expect, it } from 'vitest';
import { buildStockFreshness } from './stockFreshness';

const labels = {
  updated: 'Updated {age}',
  justAnalysed: 'Just analysed',
  justNow: 'just now',
  hoursAgo: '{count}h ago',
  daysAgo: '{count}d ago',
  priceClose: 'Price: close of {date} ({exchange})',
  priceCloseNoExchange: 'Price: close of {date}',
  financials: 'Financials: annual report {year}',
};

const base = {
  createdAt: '2026-09-26T02:00:32Z',
  priceCloseDate: '2026-09-24',
  exchangeCode: 'AMS',
  fiscalYearEndDate: '2025-09-27',
  locale: 'en',
  labels,
};

describe('buildStockFreshness', () => {
  it('names the venue and the report year in plain words', () => {
    const v = buildStockFreshness({ ...base, now: new Date('2026-09-26T10:00:00Z') });
    expect(v.priceLine).toBe('Price: close of Thu 24 Sept (Euronext Amsterdam)');
    expect(v.financialsLine).toBe('Financials: annual report 2025');
  });

  it('reads the age from the timestamp, not the as-of date', () => {
    const v = buildStockFreshness({ ...base, now: new Date('2026-09-26T10:00:32Z') });
    expect(v.age).toBe('Updated 8h ago');
  });

  it('says "Just analysed" within the hour, where the old label read "17h ago"', () => {
    const v = buildStockFreshness({
      ...base,
      createdAt: '2026-09-26T09:59:00Z',
      now: new Date('2026-09-26T10:00:00Z'),
    });
    expect(v.age).toBe('Just analysed');
  });

  it('drops the venue when the exchange is unknown, keeping the date', () => {
    const v = buildStockFreshness({
      ...base,
      exchangeCode: null,
      now: new Date('2026-09-26T10:00:00Z'),
    });
    expect(v.priceLine).toBe('Price: close of Thu 24 Sept');
  });

  it('falls back to the raw code for a venue we have not named', () => {
    const v = buildStockFreshness({
      ...base,
      exchangeCode: 'XXX',
      now: new Date('2026-09-26T10:00:00Z'),
    });
    expect(v.priceLine).toBe('Price: close of Thu 24 Sept (XXX)');
  });

  it('formats the date in Dutch for the Dutch reader', () => {
    const v = buildStockFreshness({
      ...base,
      locale: 'nl',
      labels: { ...labels, priceClose: 'Koers: slotkoers van {date} ({exchange})' },
      now: new Date('2026-09-26T10:00:00Z'),
    });
    expect(v.priceLine).toBe('Koers: slotkoers van do 24 sep (Euronext Amsterdam)');
  });

  it('shows nothing for a field it has no data for', () => {
    const v = buildStockFreshness({
      createdAt: null,
      priceCloseDate: null,
      exchangeCode: null,
      fiscalYearEndDate: null,
      locale: 'en',
      labels,
      now: new Date('2026-09-26T10:00:00Z'),
    });
    expect(v.age).toBeNull();
    expect(v.priceLine).toBeNull();
    expect(v.financialsLine).toBeNull();
  });
});
