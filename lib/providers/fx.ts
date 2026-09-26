/**
 * Currency conversion.
 *
 * Needed because a company's trading currency and its filing currency are not
 * always the same: ASML trades in USD on NasdaqGS and reports in EUR, Richemont
 * trades in CHF and reports in EUR. Every price-based ratio divides a price by a
 * figure taken from the statements, so without conversion those ratios silently
 * mix two currencies — it put ASML's P/E at 61.6 against Yahoo's 57.5.
 *
 * Rates come from the quote provider's FX pairs (`EURUSD=X`), which are the same
 * Yahoo rates behind the rest of the data.
 */

const BASE_URL = process.env.FINANCE_QUERY_BASE_URL ?? 'https://finance-query.com';
const REQUEST_TIMEOUT_MS = 15_000;

export interface FxRates {
  /** Multiply an amount in `from` to get `to`. Returns null when unknown. */
  rate(from: string, to: string): number | null;
}

/**
 * The currency a *market cap* is denominated in, resolving minor-unit aliases.
 *
 * finance-query (like Yahoo) quotes some venues in a minor unit — the LSE price
 * is in GBp (pence) — but reports the market cap in the major unit (GBP). Left
 * as-is, `GBp` has no USD rate and every London name loses its cap. The cap value
 * is already in pounds, so only the rate lookup needs the alias mapped; there is
 * no division. Prices are a different matter — a GBp *price* really is in pence —
 * so this is used only for cap conversion, never for price.
 */
export function capCurrency(currency: string | null): string {
  if (currency === 'GBp' || currency === 'GBX') return 'GBP';
  return currency ?? 'USD';
}

/** A rate table that converts nothing; every pair resolves to 1 when equal. */
export const identityFx: FxRates = {
  rate: (from, to) => (from === to ? 1 : null),
};

export function createFxRates(seed: Record<string, number> = {}): FxRates & {
  load(pairs: Array<[string, string]>): Promise<void>;
} {
  const rates = new Map<string, number>(Object.entries(seed));

  const key = (from: string, to: string) => `${from}${to}`;

  function rate(from: string, to: string): number | null {
    if (!from || !to) return null;
    if (from === to) return 1;

    const direct = rates.get(key(from, to));
    if (direct !== undefined) return direct;

    const inverse = rates.get(key(to, from));
    if (inverse !== undefined && inverse !== 0) return 1 / inverse;

    // Cross via USD, the only pair reliably quoted for everything.
    const fromUsd = rates.get(key(from, 'USD')) ?? invert(rates.get(key('USD', from)));
    const toUsd = rates.get(key(to, 'USD')) ?? invert(rates.get(key('USD', to)));
    if (fromUsd != null && toUsd != null && toUsd !== 0) return fromUsd / toUsd;

    return null;
  }

  async function load(pairs: Array<[string, string]>): Promise<void> {
    const needed = pairs.filter(([from, to]) => from !== to && rate(from, to) === null);
    if (needed.length === 0) return;

    const symbols = [...new Set(needed.map(([from, to]) => `${from}${to}=X`))];

    try {
      const response = await fetch(
        `${BASE_URL}/v2/quotes?symbols=${symbols.map(encodeURIComponent).join(',')}`,
        { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), headers: { accept: 'application/json' } },
      );
      if (!response.ok) return;

      const data = (await response.json()) as {
        quotes?: Array<{ symbol?: string; regularMarketPrice?: number | null }>;
      };

      for (const quote of data.quotes ?? []) {
        const match = /^([A-Z]{3})([A-Z]{3})=X$/.exec(quote?.symbol ?? '');
        if (!match || typeof quote.regularMarketPrice !== 'number') continue;
        rates.set(key(match[1], match[2]), quote.regularMarketPrice);
      }
    } catch {
      // Leave the table as it is; callers treat a missing rate as "cannot convert".
    }
  }

  return { rate, load };
}

function invert(value: number | undefined): number | null {
  return value === undefined || value === 0 ? null : 1 / value;
}
