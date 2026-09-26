-- 0044_thesis_signal_fingerprint.sql
--
-- Hide an AI summary as soon as the signal it describes changes (A7).
--
-- The summary was judged stale by comparing its stored signal_as_of to today's —
-- but as_of moves every night on re-evaluation, so a summary looked stale (and
-- wore a warning) even when the verdict had not budged. What matters is whether
-- the *signal* changed: the status and how many conditions it meets. Store those
-- with the summary; the page hides the text when either differs from the current
-- signal, and offers to regenerate. Never a stale summary behind a warning.

alter table ticker_summaries
  add column if not exists signal_status text,
  add column if not exists signal_conditions_met integer;
