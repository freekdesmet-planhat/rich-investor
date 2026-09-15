-- 0028_why_parts.sql
--
-- The explanation, still in sentences.
--
-- `why_en` and `why_nl` hold the same text joined into one paragraph, which is
-- right for the notification email and wrong for a phone: twelve lines covering
-- market cap, drawdown, the PEG caveat, returns, cash flow, debt and a to-do,
-- with no way to find the part you wanted. The generator has always built that
-- text from self-contained sentences and thrown the structure away in a join.
--
-- This keeps it. One array per language, each entry a sentence and the part of
-- the answer it belongs to, so the page can lead with the verdict and group the
-- rest. Nullable, because every row written before today has only the prose —
-- the page falls back to it, and the nightly run fills this in from tonight.
--
-- The prose columns stay exactly as they are: the email, the suggestion cards
-- and every stored historical explanation still read from them.

alter table signal_history
  add column why_parts jsonb;

comment on column signal_history.why_parts is
  'The explanation as tagged sentences: {"en":[{"section":"verdict","text":"..."}],"nl":[...]}. Null for rows written before it existed; the joined prose in why_en/why_nl remains the source for the email.';
