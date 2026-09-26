/**
 * The daily pipeline (build step 7, without the email step).
 *
 * Wires the provider layer, ratio engine, Lynch classification, signal logic
 * and explanation generator into one pass over a list of tickers, and persists
 * the result to `daily_snapshots`, `ratios` and `signal_history`.
 *
 * Everything a signal was decided on is stored with it — the ratio snapshot,
 * the thresholds in force and the generated explanation in both languages — so
 * a historical signal keeps its original reasoning even after thresholds or
 * figures change (section 7).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFxRates } from '@/lib/providers/fx';
import { createMarketDataService } from '@/lib/providers/marketData';
import { createSupabaseCache } from '@/lib/providers/supabaseCache';
import { formatViolations, type InvariantViolation } from '@/lib/ratios/invariants';
import { DEFAULT_THRESHOLDS, mergeThresholds } from '@/lib/ratios/thresholds';
import type { SignalStatus } from '@/lib/signal/buyWorthy';
import { readThresholdOverrides } from './thresholdStore';
import { evaluateSymbol } from './evaluateSymbol';
import { writeMarketCaps, type MarketCapWrite } from './universeCaps';
import { refreshMacroContext } from '@/lib/macro/store';
import { sendBuySignalAlerts, type NotifiableSignal, type NotifyOutcome } from './notify';
import { sendDailyDigest, type DigestEntry, type DigestOutcome } from './digest';
import {
  DEFAULT_SECTOR_RULES,
  type FocusSector,
  type SectorRule,
} from '@/lib/sectors/mapping';

export interface PipelineOptions {
  client: SupabaseClient;
  symbols: string[];
  /** User threshold overrides from `settings.thresholds`. */
  thresholdOverrides?: Record<string, unknown>;
  /** Skip estimate lookups; the universe-wide scan sets this. */
  skipEstimates?: boolean;
  /** Set for a dry run: computes and stores, but sends no alerts. */
  skipNotifications?: boolean;
  /**
   * Skip only the daily digest, while still sending per-ticker buy alerts.
   *
   * The watchlist runs in index-slices across several requests now, to stay
   * under the execution ceiling, and no single slice sees the whole watchlist —
   * so the digest, which summarises all of it, cannot be built from one slice.
   * It is sent once afterwards by /api/cron/digest, which assembles it from the
   * stored signals. Each slice sets this so it does its own alerts and leaves
   * the digest to that step.
   */
  skipDigest?: boolean;
  /** Skip the market-wide refresh; the per-ticker work does not depend on it. */
  skipMacro?: boolean;
  onProgress?: (message: string) => void;
}

export interface PipelineRow {
  symbol: string;
  /** Company name, for anything that addresses a human rather than a ticker. */
  name: string | null;
  status: SignalStatus;
  previousStatus: SignalStatus | null;
  becameBuyWorthy: boolean;
  conditionsMet: number;
  conditionsApplicable: number;
  /** Applicable conditions that did not pass, by key. */
  missing: string[];
  /** When this company next reports, straight from the quote. */
  nextEarningsDate: string | null;
  pegBasis: string;
  focusSector: FocusSector;
  lynchCategory: string;
  whyEn: string;
  whyNl: string;
  isStale: boolean;
  errors: string[];
  /** Arithmetic invariants this ticker broke, if any. Never silent. */
  violations: InvariantViolation[];
}

interface MappingRow {
  symbol: string | null;
  sector: string | null;
  industry: string | null;
  focus_sector: FocusSector;
  specificity: number;
  is_excluded: boolean;
  is_payment_processor: boolean;
}

interface UniverseRow {
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
}

export interface PipelineResult {
  rows: PipelineRow[];
  notifications: NotifyOutcome[];
  /** One entry per recipient, or empty when the day was not worth an email. */
  digest: DigestOutcome[];
}

export async function runDailyPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const {
    client,
    symbols,
    thresholdOverrides,
    skipEstimates = false,
    skipNotifications = false,
    skipDigest = false,
    skipMacro = false,
    onProgress,
  } = options;
  const log = onProgress ?? (() => {});
  const asOf = new Date().toISOString().slice(0, 10);

  // --- reference data -------------------------------------------------------
  const { data: mapRows } = await client
    .from('sector_mapping')
    .select('symbol,sector,industry,focus_sector,specificity,is_excluded,is_payment_processor')
    .returns<MappingRow[]>();

  const rules: SectorRule[] = (mapRows ?? []).length
    ? (mapRows ?? []).map((r) => ({
        symbol: r.symbol ?? undefined,
        sector: r.sector ?? undefined,
        industry: r.industry ?? undefined,
        focusSector: r.focus_sector,
        specificity: r.specificity,
        isExcluded: r.is_excluded,
        isPaymentProcessor: r.is_payment_processor,
      }))
    : DEFAULT_SECTOR_RULES;

  const { data: universeRows } = await client
    .from('universe')
    .select('symbol,name,sector,industry')
    .in('symbol', symbols)
    .returns<UniverseRow[]>();

  const universe = new Map((universeRows ?? []).map((r) => [r.symbol, r]));

  // --- previous statuses, to detect the crossing into buy-worthy ------------
  const { data: previousRows } = await client
    .from('signal_history')
    .select('symbol,status,as_of')
    .in('symbol', symbols)
    .lt('as_of', asOf)
    .order('as_of', { ascending: false })
    .returns<Array<{ symbol: string; status: SignalStatus; as_of: string }>>();

  const previousStatus = new Map<string, SignalStatus>();
  for (const row of previousRows ?? []) {
    if (!previousStatus.has(row.symbol)) previousStatus.set(row.symbol, row.status);
  }

  // Market-wide context first, and never fatally: it is a separate concern from
  // the per-ticker pipeline, so a FRED outage must not cost a night of signals.
  if (!skipMacro) {
    try {
      await refreshMacroContext(client, log);
    } catch (error) {
      log(`macro refresh failed (continuing): ${(error as Error).message}`);
    }
  }

  // --- market data ----------------------------------------------------------
  log(`fetching ${symbols.length} tickers`);
  const service = createMarketDataService({
    cache: createSupabaseCache(client),
    skipEstimates,
  });
  const bundles = await service.getBundles(symbols, '5y');

  // --- FX, in one batch -----------------------------------------------------
  const pairs: Array<[string, string]> = [];
  for (const bundle of bundles.values()) {
    const quote = bundle.quote?.currency;
    if (!quote) continue;
    if (bundle.filingCurrency) pairs.push([quote, bundle.filingCurrency]);
    pairs.push([quote, 'USD']);
  }
  const fx = createFxRates();
  await fx.load(pairs);

  // Explicit overrides win; otherwise the household's stored ones, which is
  // what makes the setting take effect without anything else being told.
  const stored = thresholdOverrides ?? (await readThresholdOverrides(client));
  const thresholds = Object.keys(stored ?? {}).length > 0
    ? mergeThresholds(stored as Record<string, unknown>)
    : DEFAULT_THRESHOLDS;

  const rows: PipelineRow[] = [];
  const ratioRows: Record<string, unknown>[] = [];
  const signalRows: Record<string, unknown>[] = [];
  const allViolations: InvariantViolation[] = [];
  const toNotify: NotifiableSignal[] = [];
  const capUpdates: MarketCapWrite[] = [];

  for (const symbol of symbols) {
    const bundle = bundles.get(symbol);
    if (!bundle) {
      log(`${symbol}: no data`);
      continue;
    }

    const meta = universe.get(symbol);
    const result = evaluateSymbol({
      symbol,
      name: meta?.name ?? bundle.quote?.name ?? null,
      sector: meta?.sector ?? null,
      industry: meta?.industry ?? null,
      bundle,
      rules,
      thresholds,
      fx,
      asOf,
      previousStatus: previousStatus.get(symbol) ?? null,
    });

    if (result.violations.length > 0) {
      log(`INVARIANT VIOLATION for ${symbol}:\n${formatViolations(result.violations)}`);
      allViolations.push(...result.violations);
    }

    if (result.becameBuyWorthy) {
      toNotify.push({
        symbol,
        name: result.name,
        asOf,
        signal: result.signal,
        ratios: result.ratios,
      });
    }

    ratioRows.push(...result.ratioRows);
    signalRows.push(result.signalRow);
    capUpdates.push({ symbol, marketCapUsd: result.marketCapUsd });

    rows.push({
      symbol,
      name: result.name,
      status: result.signal.status,
      previousStatus: result.previousStatus,
      becameBuyWorthy: result.becameBuyWorthy,
      conditionsMet: result.signal.conditionsMet,
      conditionsApplicable: result.signal.conditionsApplicable,
      missing: result.signal.missing,
      nextEarningsDate: bundle.quote?.nextEarningsDate ?? null,
      pegBasis: result.signal.pegBasis,
      focusSector: result.focusSector,
      lynchCategory: result.lynchCategory,
      whyEn: result.explanation.en,
      whyNl: result.explanation.nl,
      isStale: bundle.isStale,
      errors: bundle.errors,
      violations: result.violations,
    });
  }

  if (allViolations.length > 0) {
    log(
      `\n${allViolations.length} invariant violation(s) across ` +
        `${new Set(allViolations.map((v) => v.symbol)).size} ticker(s) — see above`,
    );
  }

  // --- persist --------------------------------------------------------------
  if (ratioRows.length > 0) {
    const { error } = await client
      .from('ratios')
      .upsert(ratioRows, { onConflict: 'symbol,as_of,ratio_key' });
    if (error) throw new Error(`ratios upsert failed: ${error.message}`);
    log(`wrote ${ratioRows.length} ratio rows`);
  }

  if (signalRows.length > 0) {
    const { error } = await client
      .from('signal_history')
      .upsert(signalRows, { onConflict: 'symbol,as_of' });
    if (error) throw new Error(`signal_history upsert failed: ${error.message}`);
    log(`wrote ${signalRows.length} signal rows`);
  }

  // Refresh the universe's cached market caps from what we just fetched (A1c),
  // so search floors and labels on real figures rather than the static band.
  const capsWritten = await writeMarketCaps(client, capUpdates);
  if (capsWritten > 0) log(`refreshed ${capsWritten} universe market caps`);

  // Alerts go out only after everything is stored, so a failed write never
  // produces an email about a signal that was not recorded.
  let notifications: NotifyOutcome[] = [];
  if (toNotify.length > 0 && !skipNotifications) {
    notifications = await sendBuySignalAlerts(client, toNotify, { onProgress: log });
  } else if (toNotify.length > 0) {
    log(`${toNotify.length} new buy signal(s), notifications skipped`);
  }

  // The digest covers the whole run rather than a single crossing, so it goes
  // out after the per-ticker alerts and reports on everything evaluated. It
  // decides for itself whether the day was worth an email.
  let digest: DigestOutcome[] = [];
  if (!skipNotifications && !skipDigest) {
    const entries: DigestEntry[] = rows.map((row) => ({
      symbol: row.symbol,
      name: row.name,
      status: row.status,
      previousStatus: row.previousStatus,
      conditionsMet: row.conditionsMet,
      conditionsApplicable: row.conditionsApplicable,
      missing: row.missing,
      nextEarningsDate: row.nextEarningsDate ?? null,
    }));
    digest = await sendDailyDigest(client, entries, asOf, { onProgress: log });
  }

  return { rows, notifications, digest };
}

/** The seed list from section 3.2. */
export const SEED_SYMBOLS = [
  'NVDA', 'ASML', 'AAPL', 'MSFT', 'META', 'GOOGL', 'NFLX', 'AMZN', 'ADBE', 'AMD',
  'AVGO', 'AMAT', 'V', 'MA', 'PYPL', 'AXP', 'ADYEN.AS', 'TSLA', 'BKNG', 'NKE',
  'SBUX', 'RMS.PA', 'MC.PA', 'KER.PA', 'CFR.SW', 'EL.PA', 'DIS',
];
