-- 0013_ratio_currency.sql
-- Records the currency a stored ratio is denominated in.
--
-- Most ratios are dimensionless, but market cap is in USD while the figures
-- behind the price-based ratios are in the filing currency. Storing the
-- denomination means a stored number can never be read in the wrong currency
-- later, which is the failure that inflated ASML's forward growth.

alter table ratios
  add column currency text;

comment on column ratios.currency is
  'Currency the value is denominated in; null for pure ratios and percentages.';
