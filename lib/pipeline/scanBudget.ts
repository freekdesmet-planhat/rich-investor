/**
 * How many universe candidates the nightly run may evaluate.
 *
 * The nightly job does two things, and only one of them is obligatory. The
 * watchlist pass re-evaluates every ticker you follow; that is the part the
 * digest, the trend view and the whole point of the app depend on, and it runs
 * first. The universe scan fills the suggestion feed a little at a time and has
 * thousands of names to get through either way — so it is the part that can
 * take whatever is left, and take less on a night when the watchlist took
 * longer.
 *
 * A fixed batch could not express that. Thirty was a guess that was too small
 * on a fast night and too large on a slow one; what the scan should get is a
 * batch it can actually afford, measured rather than assumed.
 *
 * So there are two numbers, and the smaller wins: what was *asked for*
 * (`SCAN_BATCH_SIZE`, or `DEFAULT_SCAN_BATCH` when nothing usable is
 * configured) and what the clock can *afford*. Purely time-derived batches came
 * before this and were the better idea on paper, but they had no floor and no
 * name for their own zero — a night that scanned nothing looked exactly like a
 * night that was never asked to. Every outcome here is now named and logged.
 *
 * The budget being divided is *time*, not a provider allowance, which is worth
 * stating because it is not the obvious reading:
 *
 *   the watchlist pass fetches fundamentals and estimates, so it spends one FMP
 *   call per ticker — about thirty a night;
 *
 *   the scan sets `skipEstimates` and so spends no FMP at all. FMP's free tier
 *   is ~250 requests a day, which leaves room for roughly two hundred on-demand
 *   analyses after the watchlist has taken its share — far more than anyone
 *   adds in a day, so FMP is not the constraint;
 *
 *   what the scan actually spends is EDGAR and Yahoo requests, and EDGAR is
 *   paced by a global minimum interval. That makes scan volume a claim on the
 *   clock, and the nightly function has a 300-second ceiling.
 *
 * So: measure how long the watchlist took, keep a margin to write the results,
 * and give the scan what remains.
 */

/**
 * How long a request may actually run here, measured rather than declared.
 *
 * This was 300_000, to match the `maxDuration = 300` the route exports. That
 * number is a request, not a guarantee, and on this plan it is not granted.
 * Probed directly against the deployment:
 *
 *   silent request, 25s          200
 *   silent request, 30s          504 Inactivity Timeout
 *   silent request, 40s and up   500 "the edge function timed out"
 *   streamed, 40s / 90s / 200s   200, body truncated around 30s either way
 *   heartbeat into Postgres      last beat at 58s, then nothing, ever
 *
 * So there are two ceilings and they are not the same one. The connection is
 * taken away at roughly 26s — which is what the caller sees, and why the
 * nightly job's 504 arrived while the job was still working. The process is
 * killed at roughly 60s, which is the one that decides how much work can be
 * done, and is invisible from the caller's side entirely.
 *
 * Streaming does not move either of them. It keeps the status line at 200 and
 * lets the body dribble out past 26s, but the function still stops at the same
 * place; all it changes is that failure starts looking like success.
 *
 * 60s, then, with the margin below taken out of it. Anything that needs longer
 * has to be split across requests rather than asked for politely.
 */
export const RUN_CEILING_MS = 60_000;

/**
 * Held back from the scan's share.
 *
 * The run still has to save the cursor and write its response after the scan
 * returns, and a scan that used the last second would lose both — including the
 * cursor, which is what stops tomorrow re-walking the same candidates.
 *
 * Ten seconds of sixty, where it used to be thirty of three hundred. The work
 * it protects has not changed — a cursor write and a telemetry update — but it
 * is now a sixth of the budget rather than a tenth, and taking the old figure
 * into the real ceiling would have left the scan half of what it has.
 */
export const SAFETY_MARGIN_MS = 10_000;

/**
 * What one candidate costs before anything has been measured.
 *
 * Deliberately pessimistic: guessing high means a small first batch that
 * finishes, and the observation from that night corrects it. Guessing low means
 * a first night that overruns, which is the failure this is meant to avoid.
 */
export const DEFAULT_MS_PER_CANDIDATE = 3_000;

/** Never more than this, whatever the arithmetic or the environment says. */
export const MAX_SCAN_BATCH = 200;

/**
 * The batch used when `SCAN_BATCH_SIZE` says nothing usable.
 *
 * There used to be no default: an unset variable fell through to the time
 * arithmetic alone, and an unreadable one was treated as unset. Both are
 * defensible, and both produced the same failure in practice — a night on which
 * the scan did no work and said nothing about why. A named default means the
 * only way to reach a batch of zero is to ask for one, or to genuinely have no
 * time left, and both of those are now stated rather than inferred.
 */
export const DEFAULT_SCAN_BATCH = 60;

export interface ScanBudgetInput {
  /** Milliseconds the whole run may take. */
  ceilingMs?: number;
  /** Milliseconds already spent — in practice, the watchlist pass. */
  elapsedMs: number;
  /** Cost per candidate observed on a previous night, when there is one. */
  msPerCandidate?: number | null;
  /** `SCAN_BATCH_SIZE`, which overrides the arithmetic when set. */
  override?: string | null;
}

/**
 * What `SCAN_BATCH_SIZE` was, as a fact rather than as a number.
 *
 * `null` used to mean three different things — unset, unreadable, and "the
 * value was fine" — which is why an unreadable value could silently disable the
 * scan. Each now has its own name, and the caller logs which one it got.
 */
export type OverrideKind = 'set' | 'unset' | 'invalid' | 'disabled';

export interface OverrideResult {
  /** Null when nothing usable was configured. */
  value: number | null;
  kind: OverrideKind;
  raw: string | null;
}

export type ScanBudgetReason =
  /** An explicit SCAN_BATCH_SIZE decided it. */
  | 'override'
  /** Nothing was configured, so DEFAULT_SCAN_BATCH did. */
  | 'default'
  /** Something unreadable was configured; DEFAULT_SCAN_BATCH did. */
  | 'invalid_override'
  /** SCAN_BATCH_SIZE=0 — the scan is switched off on purpose. */
  | 'disabled'
  /** The clock, not the configuration, was the binding constraint. */
  | 'time'
  /** The watchlist used the whole run; there is nothing left to give. */
  | 'exhausted';

export interface ScanBudget {
  limit: number;
  /** Why it came out at that number, so a short night is explicable. */
  reason: ScanBudgetReason;
  msPerCandidate: number;
  remainingMs: number;
  /** Lines for the run log, so no batch of zero is ever unexplained. */
  notes: string[];
  override: OverrideResult;
}

/**
 * Parses `SCAN_BATCH_SIZE`.
 *
 * Anything that is not a non-negative whole number is `invalid` rather than
 * coerced: `Number('sixty')` is NaN, and passing NaN as a limit produced a scan
 * that quietly evaluated nothing. Zero is a real answer — "skip the scan
 * tonight" — so it is honoured, and named `disabled` so the run can say that it
 * was asked to rather than leaving a zero to be puzzled over.
 */
export function parseOverride(raw: string | null | undefined): OverrideResult {
  const value = raw ?? null;
  if (value == null || value.trim() === '') return { value: null, kind: 'unset', raw: value };

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    return { value: null, kind: 'invalid', raw: value };
  }
  if (parsed === 0) return { value: 0, kind: 'disabled', raw: value };

  return { value: Math.min(parsed, MAX_SCAN_BATCH), kind: 'set', raw: value };
}

/** How many candidates fit in what is left of the run. */
export function scanBudget(input: ScanBudgetInput): ScanBudget {
  const ceilingMs = input.ceilingMs ?? RUN_CEILING_MS;
  const msPerCandidate =
    input.msPerCandidate != null && input.msPerCandidate > 0
      ? input.msPerCandidate
      : DEFAULT_MS_PER_CANDIDATE;

  const remainingMs = Math.max(0, ceilingMs - input.elapsedMs - SAFETY_MARGIN_MS);
  const affordable = Math.min(MAX_SCAN_BATCH, Math.floor(remainingMs / msPerCandidate));

  const override = parseOverride(input.override);
  const notes: string[] = [];

  let wanted: number;
  let wantedReason: ScanBudgetReason;

  switch (override.kind) {
    case 'set':
      wanted = override.value ?? DEFAULT_SCAN_BATCH;
      wantedReason = 'override';
      notes.push(`SCAN_BATCH_SIZE=${override.raw}: asking for ${wanted} candidates`);
      break;
    case 'disabled':
      wanted = 0;
      wantedReason = 'disabled';
      notes.push('SCAN_BATCH_SIZE=0: the scan is switched off by configuration, not by accident');
      break;
    case 'invalid':
      wanted = DEFAULT_SCAN_BATCH;
      wantedReason = 'invalid_override';
      notes.push(
        `SCAN_BATCH_SIZE=${JSON.stringify(override.raw)} is not a whole number of candidates; ` +
          `using the default of ${DEFAULT_SCAN_BATCH}`,
      );
      break;
    default:
      wanted = DEFAULT_SCAN_BATCH;
      wantedReason = 'default';
      notes.push(`SCAN_BATCH_SIZE is unset; using the default of ${DEFAULT_SCAN_BATCH}`);
      break;
  }

  // An instruction, but not one that can book time the run does not have.
  const limit = Math.max(0, Math.min(wanted, affordable));

  let reason: ScanBudgetReason = wantedReason;
  if (wanted === 0) {
    reason = 'disabled';
  } else if (affordable <= 0) {
    reason = 'exhausted';
    notes.push(
      `no time left for the scan: ${Math.round(remainingMs / 1000)}s remain at ` +
        `~${msPerCandidate}ms per candidate`,
    );
  } else if (affordable < wanted) {
    reason = 'time';
    notes.push(
      `the clock allows ${affordable} of the ${wanted} candidates asked for ` +
        `(${Math.round(remainingMs / 1000)}s at ~${msPerCandidate}ms each)`,
    );
  }

  return { limit, reason, msPerCandidate, remainingMs, notes, override };
}

/**
 * The cost per candidate to carry into tomorrow.
 *
 * Smoothed against the previous figure so one slow night — a provider having a
 * bad hour — halves the next batch rather than collapsing it, and so a single
 * fast night cannot talk the run into a batch it will not finish.
 */
export function observedMsPerCandidate(
  scanMs: number,
  attempted: number,
  previous?: number | null,
): number | null {
  if (!Number.isFinite(scanMs) || scanMs <= 0 || attempted <= 0) return null;

  const observed = scanMs / attempted;
  if (previous == null || previous <= 0) return Math.round(observed);

  return Math.round((observed + previous) / 2);
}
