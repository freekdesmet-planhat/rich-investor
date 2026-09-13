# Ratio explanations (English)

This file is the single source for the English explanation of every ratio, every
Lynch category and every buy-worthy condition. The app's tooltips and the
`translations` table are filled from it — nothing is hardcoded in components.

Translated from `docs/ratios.nl.md`, which is written first and stays close to
the book's own Dutch phrasing. This is a faithful translation rather than a
literal one: it keeps the book's meaning and register, not its word order.

Block format:

    ## <namespace>:<key>
    **Name:** short title on the card
    **Target:** the target, noting whether it comes from the book

    The explanation behind the "?" button.

---

## ratio:pe
**Name:** Price-to-earnings ratio (P/E)
**Target:** maximum 30 (from the book)

The best-known valuation metric, but incomplete on its own: it looks at a single
year of earnings and says nothing about growth. A low P/E is never by itself a
reason to buy — without earnings growth, a stock is in effect never cheap. Always
judge the P/E together with the PEG ratio and the growth category. The book gives
30 as a ceiling even for fast growers: paying 60 times earnings for 60% growth
isn't realistic. For large technology companies with heavy research and
development spending, it is worth also checking the R&D-adjusted P/E.

## ratio:peg
**Name:** PEG ratio
**Target:** ≤ 1 at high growth, ≤ 0.7 at average growth, ≤ 0.5 at low growth (from the book)

The book's central valuation metric: it ties price to growth. Earnings growth is
"a vector with direction, force and length"; the PEG makes that measurable. The
book wants you to get progressively stricter as growth is lower, hence three
different thresholds. Note that a PEG of 1 at 5% growth returns far less than a
PEG of 1 at 25% growth — never rely on a single metric. The condition for high
growth is that the company can sustain it, thanks to a strong competitive
advantage.

The app tests the PEG two ways: against realised earnings growth, and against
analysts' expected growth. If only the forward variant passes, the app says so
explicitly — that growth has not yet shown up in reported results.

## ratio:ev_ebit
**Name:** Enterprise value / EBIT
**Target:** ≤ 20 (app default)

The book names this one of the three most important valuation methods, and more
precise than the P/E because it includes debt: buying a company means buying its
debt too. Think of an iceberg — market value is the visible part above water,
debt the invisible part below. EBIT shows operating profit independent of
financing and tax structure. Compare mainly against the company's own history and
against sector peers. Not applicable to banks and insurers.

## ratio:p_fcf
**Name:** Price / free cash flow
**Target:** ≤ 25 (app default)

More important to the rich investor than net income. Free cash flow is what is
genuinely left after all costs, taxes and investments — that gives management the
freedom to make shareholder-friendly choices (reinvest, pay down debt, dividends,
buybacks) without financial pressure. An extra quality signal: free cash flow
close to net income points to conservative, transparent accounting. Negative free
cash flow is red.

## ratio:earnings_quality
**Name:** Operating cash flow / net income
**Target:** ≥ 1 (from the book)

If a company reports more net income than the cash it generates from its core
operations, ask where the gap comes from — often it is one-off gains, such as
selling a building or equipment, which are not structural income. Rising
operating cash flow is a clear signal of real, self-sustaining growth. The book
calls it a red flag outright when operating cash flow is negative while net
income is positive.

## ratio:roe
**Name:** Return on equity (ROE)
**Target:** > 15%, sustained over several years (from the book)

Warren Buffett's favourite ratio; the book calls it "the company's savings rate".
It shows how much profit a company earns on every euro of equity invested. The
compounding effect only works if (1) profit is reinvested and (2) the company
holds that high return as equity grows — which only happens with a strong moat
and enough room to grow. One good year is not enough: the app checks whether the
bar was cleared in at least four of the last five years.

## ratio:roa
**Name:** Return on assets (ROA)
**Target:** > 10%, consistently (from the book)

A variant of ROE that also counts borrowed capital. A high ROA shows the company
puts all its available resources to effective use, not just its equity. Combined
with a high ROE, the book calls this "a strong foundation for value creation".

For payment processors the ROA is adjusted. Their balance sheets carry settlement
balances — funds in transit between merchants, card networks and banks — which
inflate assets without saying anything about operating performance. The raw ROA
stays visible next to the adjusted one.

## ratio:eps_growth
**Name:** Earnings-per-share growth
**Target:** ≥ 15% per year (from the book)

According to the book, the outcome everything else ultimately serves: growth in
earnings per share. Companies with consistent high or average earnings growth
deliver the best long-term returns. Peter Lynch calls 20 to 25% the optimal,
sustainable pace. Also watch how much of the growth comes from genuine earnings
gains and how much from buying back shares.

Growth is measured by fitting a least-squares line through every year, not just
between the first and the last. That way a single exceptional opening or closing
year does not set the whole growth figure on its own.

## ratio:revenue_growth
**Name:** Revenue growth
**Target:** ≥ 10% per year (app default)

The book calls revenue "the turbo trigger": harder to manipulate than profit, and
without revenue growth, earnings growth eventually hits a ceiling, since costs
cannot be cut forever. Also look at the revenue mix (one-off versus recurring,
subscriptions) and at price versus volume.

## ratio:gross_margin
**Name:** Gross margin
**Target:** ≥ 50%, or risen in each of the last five years (from the book)

Margins make competitive advantage measurable. High, stable margins signal pricing
power. The book looks for two kinds of company: those with a high gross margin,
and those with a lower margin that rises steadily. The real magic happens when
revenue growth coincides with rising margins — that is when earnings growth
accelerates.

## ratio:net_margin
**Name:** Net margin
**Target:** ≥ 20% (from the book)

The book cites around 12% as the S&P 500 average and wants companies well above
it. The net margin shows what actually remains as profit out of every euro of
revenue.

## ratio:debt
**Name:** Net debt / EBITDA
**Target:** ≤ 1 (app default)

The book gives no numbers here, but is unambiguous: too much debt is a no-go
criterion. The rich investor chooses large, mature companies with plenty of cash,
stable income and little debt. Risks rise with higher rates or slowing growth,
especially for capital-intensive companies. Large, established companies typically
need less debt than young, fast-growing ones. A net cash position is green: there
is more cash than debt.

## ratio:dividend_yield
**Name:** Dividend yield
**Target:** not a buy criterion; above 7% is a warning (from the book)

The book states it plainly: never invest solely on dividend yield. The rich
investor looks at total return — price appreciation plus dividend — where most of
the return comes from price appreciation. Dividends do act as an anchor during
volatility. Always weigh the dividend alongside the payout ratio, free cash flow,
dividend history and dividend growth. US companies cut dividends less readily than
European ones. No dividend at all is not a negative.

## ratio:payout_ratio
**Name:** Payout ratio
**Target:** ≤ 40% for growth stocks (from the book)

0% means all profit is reinvested — exactly what the compounding effect needs.
100% means equity stops growing. A high payout ratio caps the upside, like
withdrawing your savings interest every year. The book cites 90% as a signal that
little growth room is left and the dividend has become fragile, and around 36% as
the S&P 500 average in 2024. A company with both a high ROE and a high payout
ratio is often at the point where further in-house growth has become less
profitable.

## ratio:rnd_adjusted_pe
**Name:** R&D-adjusted P/E
**Target:** ≤ 20 (from the book)

Large technology companies book enormous research and development spending
directly as expense, even though much of it is investment in the future
("moonshots"). Adding it back to earnings reveals hidden profitability — the book
shows how Meta's P/E of 27 becomes roughly 10.8 once adjusted for R&D. Only
meaningful for companies with high R&D spending and strong revenue growth, and be
conservative: not all R&D is hidden profit. The book names three benefits: you can
responsibly enter at a seemingly high P/E, R&D spending correlates strongly with
the long-term share price, and if the company cuts R&D, reported profit jumps.

## ratio:p_s
**Name:** Price / sales
**Target:** informational, no colour code

Mainly useful for fast-growing companies that are not yet profitable. A warning
from the book: in 2008 it became painfully clear that revenue is not profit —
companies that looked cheap on this ratio were hit hardest in the crash.

## ratio:p_b
**Name:** Price / book
**Target:** informational; mainly relevant for banks and insurers

Has lost much of its popularity and says little about technology and platform
companies, which create value through network effects. Watch for "value traps":
stocks that only look cheap on book value.

## ratio:inventory_receivables
**Name:** Inventory and receivables versus revenue
**Target:** not growing faster than revenue (from the book)

Rising inventory means products are not selling as planned; rising receivables
mean customers are paying more slowly. Both can lead to write-downs and profit
warnings, especially in sectors where things move quickly. Companies with no
inventory — software, payment networks — are what the book calls the ideal
business model, and this check does not apply to them.

For payment processors this card is greyed out: their receivables are settlement
balances that scale with transaction volume, and say nothing about the risk of a
customer not paying.

## ratio:drawdown_5y
**Name:** Decline from the 5-year high
**Target:** ≥ 50% below the highest closing price in five years (from the book)

"The logarithmic waterfall": a 20% drop needs a 25% recovery, a 70% drop needs
233%. The deeper a quality stock falls, the bigger the statistical edge. The rich
investor watches mainly for drops of 50 to 70% in quality companies, since those
are rare without a structural problem. The crucial question the app *cannot*
answer, and puts to you instead: is the problem temporary or structural? A price
drop alone is never a reason to buy.

## ratio:market_cap
**Name:** Market capitalisation
**Target:** ≥ $10 billion (from the book)

According to the book, sector leaders have more recovery potential: they recover
faster, with more certainty, and keep compounding afterwards. Greenwald: the gap
to number two counts as much as market share itself. Small companies are cheap
more often, but they also stay cheap for longer.

---

## lynch:high_growth
**Name:** High earnings growth
**Target:** earnings per share growing 20% or more per year

The category the book focuses on. These companies can receive a buy signal,
provided the growth is sustainable thanks to a strong competitive advantage.

## lynch:average_growth
**Name:** Average earnings growth
**Target:** earnings per share growing 10 to 20% per year

This category can also receive a buy signal, but the PEG threshold is stricter:
0.7 rather than 1.

## lynch:low_growth
**Name:** Low earnings growth
**Target:** earnings per share growing less than 10% per year

Only with an explicit warning attached. The PEG threshold here is 0.5.

## lynch:cyclical
**Name:** Cyclical
**Target:** outside the book's focus

Earnings swing strongly with the economic cycle. The book has auto, construction,
commodities and industrials in mind here. Semiconductors are explicitly not
included: their earnings are volatile, but the book calls microchips the
best-performing subsector it covers.

## lynch:turnaround
**Name:** Turnaround
**Target:** outside the focus, high risk

The company is loss-making, or profit has fallen for several years running. A
recovery story like this can work out exceptionally well, but the book puts it
firmly in the high-risk category and keeps it outside the focus: the outcome
depends on a turnaround that has yet to be proven, rather than on a demonstrated
ability to grow earnings. This category never receives a buy signal.

## lynch:financial_institution
**Name:** Financial institution
**Target:** outside the focus

Banks and insurers. Their balance sheets mean something different from an
operating company's, so ratios such as EV/EBIT and price/free cash flow are greyed
out here and price/book is shown instead.

## lynch:unknown
**Name:** Not classifiable
**Target:** excluded from buy signals

There is too little coherent earnings history to measure growth. The book warns
against filling a lack of information with an assumption, so the app does not
force a category here.

## lynch:basis_eps_partial
**Name:** Measured over part of the period
**Target:** —

The earnings history has a gap, so growth is measured over the longest
consecutive run inside the five-year window.

## lynch:basis_revenue
**Name:** Classified by revenue growth
**Target:** —

The earnings history is incomplete, so the classification is based on revenue
growth. This applies to the category only — not to the PEG, and not to the buy
signal.

## lynch:tolerance_applied
**Name:** Just inside the band
**Target:** —

Growth fell just short of this category's threshold and was resolved upward
within a one-percentage-point margin. Lynch's percentages come from a qualitative
method; a tenth of a percentage point should not decide which PEG threshold
applies.

---

## condition:focus_sector
**Name:** Focus sector
**Target:** falls within one of the four focus sectors (from the book)

The book limits itself to four sectors: information technology, luxury and
consumer discretionary goods, entertainment and interactive media, and non-bank
financial services. You can add stocks outside them yourself, but they carry an
orange label and never receive a buy signal.

## condition:lynch_category
**Name:** Growth category
**Target:** high or average earnings growth (from the book)

Only companies with high or average earnings growth qualify for a buy signal.
Cyclicals, turnarounds and financial institutions sit outside the book's focus;
low-growth companies only with an explicit warning.

## condition:market_cap
**Name:** Market capitalisation
**Target:** at least $10 billion (from the book)

The rich investor chooses large, established companies. They recover faster and
with more certainty after a deep fall, and keep compounding afterwards.

## condition:drawdown
**Name:** Decline from the 5-year high
**Target:** at least 50% below the highest closing price in five years (from the book)

The book's core signal. Falls of 50 to 70% in quality companies are rare without
a structural problem, and that is exactly where the statistical edge lies.
Adjustable, with a floor of 35%.

## condition:peg
**Name:** PEG ratio
**Target:** below the growth category's threshold, realised or expected (from the book)

The condition passes if the PEG based on realised earnings growth *or* the PEG
based on expected growth stays under the threshold. Which of the two carried it
is recorded with the signal — if only the forward variant passed, the judgement
rests on an expectation that has not yet shown up in the figures.

## condition:pe
**Name:** Price-to-earnings ratio
**Target:** ≤ 30, or ≤ 20 after adjusting for R&D (from the book)

The ceiling of 30 applies even to fast growers. For technology companies with
heavy R&D spending, the adjusted variant counts as an alternative.

## condition:returns
**Name:** Return on equity and assets
**Target:** ROE > 15% and ROA > 10%, over several years (from the book)

Both have to be cleared consistently, not just in the latest year. For payment
processors the ROA is adjusted for settlement balances.

## condition:cash_flow
**Name:** Cash flow quality
**Target:** free cash flow positive and operating cash flow ≥ 70% of net income (from the book)

Profit that never arrives as cash is not profit you can build on. For banks and
insurers this condition does not apply and does not count towards the
denominator.

## condition:debt
**Name:** Debt level
**Target:** net debt/EBITDA ≤ 2.5 (app default)

Too much debt is a no-go criterion for the book. For banks and insurers this
condition does not apply.

---

## catalyst:management_reaffirms_targets
**Name:** Management reaffirms its long-term targets
**Target:** —

Management is standing by the targets it gave earlier. That is one of the
strongest signs a setback is seen as temporary by the people with the most
information.

## catalyst:management_buying_shares
**Name:** Management is buying its own shares
**Target:** —

Directors buying with their own money are putting conviction behind their words.

## catalyst:buybacks
**Name:** Share buybacks
**Target:** —

The company is buying back stock, which raises earnings per share and signals
that management considers the price low.

## catalyst:dividend_increase
**Name:** Dividend increase
**Target:** —

Raising the dividend during a price fall signals confidence in the cash flow.

## catalyst:sector_still_growing
**Name:** The sector is still growing
**Target:** —

The problem is with this company, not with the market it operates in.

## catalyst:founder_or_long_tenured_ceo
**Name:** Founder or long-tenured CEO still at the helm
**Target:** —

Continuity at the top, with an owner's view of the long term.

## catalyst:problem_confined_to_one_cycle
**Name:** The problem is confined to one cycle
**Target:** —

Demand or supply, not both at once. The book treats that as the difference
between a temporary dip and a structural problem.

## sell_signal:deteriorating_performance
**Name:** Structurally deteriorating performance
**Target:** —

Not one weak quarter, but a line that keeps heading the wrong way.

## sell_signal:large_acquisition_high_premium
**Name:** A large acquisition at a high premium
**Target:** —

The book is wary of companies that buy growth rather than earn it.

## sell_signal:involuntary_cfo_departure
**Name:** Involuntary CFO departure
**Target:** —

A finance chief who does not leave of their own accord is rarely good news.

## sell_signal:declining_solvency
**Name:** Sharply declining solvency
**Target:** —

The debt position is worsening fast enough to remove the room to manoeuvre.

## sell_signal:unusual_insider_selling
**Name:** Unusually large insider selling
**Target:** —

Directors selling at the same time and in size usually know something.

## sell_signal:no_visible_future_growth
**Name:** I no longer see where future earnings growth would come from
**Target:** —

The book puts this deliberately in the first person: if *you* can no longer tell
the story, that alone is a reason to sell.
