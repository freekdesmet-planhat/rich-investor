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
 * on a fast night and too large on a slow one; what the scan should get is the
 * remainder of the run's budget, measured rather than assumed.
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

/** The nightly route's own ceiling, which is what the run is dividing up. */
export const RUN_CEILING_MS = 300_000;

/**
 * Held back from the scan's share.
 *
 * The run still has to save the cursor and write its response after the scan
 * returns, and a scan that used the last second would lose both — including the
 * cursor, which is what stops tomorrow re-walking the same candidates.
 */
export const SAFETY_MARGIN_MS = 30_000;

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

export interface ScanBudget {
  limit: number;
  /** Why it came out at that number, so a short night is explicable. */
  reason: 'override' | 'time' | 'exhausted';
  msPerCandidate: number;
  remainingMs: number;
}

/**
 * Parses `SCAN_BATCH_SIZE`.
 *
 * Anything that is not a non-negative whole number is treated as unset rather
 * than coerced: `Number('sixty')` is NaN, and passing NaN as a limit produced a
 * scan that quietly evaluated nothing. Zero is a real answer — "skip the scan
 * tonight" — so it is honoured rather than swallowed.
 */
export function parseOverride(raw: string | null | undefined): number | null {
  if (raw == null || raw.trim() === '') return null;

  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) return null;

  return Math.min(value, MAX_SCAN_BATCH);
}

/** How many candidates fit in what is left of the run. */
export function scanBudget(input: ScanBudgetInput): ScanBudget {
  const ceilingMs = input.ceilingMs ?? RUN_CEILING_MS;
  const msPerCandidate =
    input.msPerCandidate != null && input.msPerCandidate > 0
      ? input.msPerCandidate
      : DEFAULT_MS_PER_CANDIDATE;

  const remainingMs = Math.max(0, ceilingMs - input.elapsedMs - SAFETY_MARGIN_MS);

  const override = parseOverride(input.override);
  if (override != null) {
    // An explicit setting is an instruction, not a suggestion — but it still
    // cannot book time the run does not have.
    const affordable = Math.floor(remainingMs / msPerCandidate);
    return {
      limit: Math.min(override, Math.max(0, affordable)),
      reason: 'override',
      msPerCandidate,
      remainingMs,
    };
  }

  const limit = Math.min(MAX_SCAN_BATCH, Math.floor(remainingMs / msPerCandidate));

  return {
    limit: Math.max(0, limit),
    // A watchlist pass that consumed the whole ceiling is not an error; it means
    // the watchlist itself now needs the entire run, and the scan waits.
    reason: limit <= 0 ? 'exhausted' : 'time',
    msPerCandidate,
    remainingMs,
  };
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
