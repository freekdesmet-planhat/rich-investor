-- 0012_payment_processors_and_signal_basis.sql
--
-- 1. Payment-processor sub-classification.
--
-- Payment processors stay fully inside the book's focus — Visa, Mastercard,
-- PayPal, Amex and Adyen are named favourites — but their balance sheets carry
-- customer settlement balances: funds in transit between merchants, card
-- networks and banks. Those inflate total assets and receivables in a way that
-- says nothing about operating performance or collection risk.
--
-- This is the same reasoning the book already applies to banks and insurers,
-- just narrower: the balance sheet does not mean what it means for an operating
-- company, so some ratios need adjusting rather than reading at face value.
--
-- 2. Which PEG variant satisfied the buy-worthy check.
--
-- Hard condition 5 now passes on trailing OR forward PEG, so a stored signal
-- has to record which one fired — a forward-only pass rests on unconfirmed
-- analyst consensus and the explanation has to say so.
--
-- 3. Applicable-condition denominator.
--
-- Not every hard condition applies to every company. Banks and insurers have no
-- meaningful EV/EBIT or P/FCF, and payment processors now have no meaningful
-- inventory/receivables check. Scoring those against a fixed 9 would penalise
-- them for checks that cannot apply, so the denominator is stored per signal.

-- ---------------------------------------------------------------------------
-- sector_mapping
-- ---------------------------------------------------------------------------
alter table sector_mapping
  add column is_payment_processor boolean not null default false,
  -- Auto-scan candidates matching the payment keyword rule are flagged for
  -- manual confirmation rather than tagged outright: the first classification
  -- of a company needs a human eye.
  add column needs_review boolean not null default false;

comment on column sector_mapping.is_payment_processor is
  'Payment network or processor: in focus, but total assets and receivables carry settlement balances.';
comment on column sector_mapping.needs_review is
  'Matched the payment-processor keyword rule automatically; awaiting manual confirmation.';

-- Tag the five named by the book. These are symbol rules, so they win over any
-- sector/industry rule.
insert into sector_mapping (symbol, focus_sector, specificity, is_payment_processor, note)
values
  ('V',        'financial_services_non_bank', 100, true, 'Payment network (book, section 4).'),
  ('MA',       'financial_services_non_bank', 100, true, 'Payment network (book, section 4).'),
  ('PYPL',     'financial_services_non_bank', 100, true, 'Payment processor (book, section 4).'),
  ('AXP',      'financial_services_non_bank', 100, true, 'Payment network and card issuer (book, section 4).')
on conflict (symbol, sector, industry) do update
  set is_payment_processor = excluded.is_payment_processor,
      focus_sector         = excluded.focus_sector,
      specificity          = excluded.specificity,
      note                 = excluded.note;

-- Adyen already has a symbol rule from the universe import; add the flag to it.
update sector_mapping
   set is_payment_processor = true,
       note = coalesce(note, '') ||
              ' Payment processor: settlement balances inflate assets and receivables.'
 where symbol = 'ADYEN.AS';

-- ---------------------------------------------------------------------------
-- signal_history
-- ---------------------------------------------------------------------------
alter table signal_history
  add column peg_basis text check (peg_basis in ('trailing', 'forward', 'both', 'none')),
  -- How many of the hard conditions actually applied to this company.
  add column conditions_applicable int not null default 9;

comment on column signal_history.peg_basis is
  'Which PEG variant satisfied hard condition 5: trailing, forward, both, or none.';
comment on column signal_history.conditions_applicable is
  'Denominator for conditions_met: the hard conditions applicable to this company.';

-- ---------------------------------------------------------------------------
-- ratios
-- ---------------------------------------------------------------------------
-- A ratio can now be reported twice: the raw figure and an adjusted one, shown
-- side by side with the raw greyed out (payment-processor ROA).
alter table ratios
  add column is_adjusted boolean not null default false,
  add column raw_value numeric;

comment on column ratios.is_adjusted is
  'True when `value` is an adjusted figure and `raw_value` holds the unadjusted one.';
