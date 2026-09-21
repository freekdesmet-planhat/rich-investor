/**
 * Reading SEC Form 4 — the filing an insider makes when they trade.
 *
 * Parsing only. Fetching lives in secInsider.ts, so the hard part — deciding
 * what a filing actually says — can be tested against fixtures without a
 * network.
 *
 * The parsing logic was checked against daniel3303/Equibles, an open-source
 * EDGAR aggregator that handles the same forms, for the cases a first
 * implementation gets wrong: the two separate tables, holdings that are not
 * transactions, and the fact that only one transaction code means what a
 * reader assumes "insider buying" means. It is a reference, not a dependency —
 * none of its code is here, and this has to be ours to maintain.
 *
 * One Form 4 can report several transactions by one person on one day, and a
 * company files many of them a week. The output is flat: one row per
 * transaction, with the filing and the person attached.
 */

/**
 * Form 4 transaction codes, and which of them is a purchase.
 *
 * This is the whole game, and the reason a naive reading of Form 4 data is
 * worse than none. "An insider acquired shares" is true of most of these
 * codes and means something different in each:
 *
 *   P  bought on the open market, with their own money — conviction
 *   A  granted shares as compensation — the company's decision, not theirs
 *   M  exercised an option they were given years ago
 *   F  handed shares back to cover the tax on a grant
 *   G  received or made a gift
 *   C  converted one security into another
 *
 * Only `P` answers "is management buying its own shares". Counting `A` as
 * buying would report every vesting date as a vote of confidence, which is
 * how a lot of insider-sentiment data ends up meaningless.
 */
export const TRANSACTION_CODES = {
  P: 'open-market purchase',
  S: 'open-market sale',
  A: 'grant or award',
  D: 'disposition to the issuer',
  F: 'shares withheld for tax',
  M: 'option exercise',
  C: 'conversion',
  G: 'gift',
  X: 'in-the-money derivative exercise',
  J: 'other acquisition or disposal',
  K: 'equity swap',
  U: 'tender of shares',
} as const;

export type TransactionCode = keyof typeof TRANSACTION_CODES;

/** The only code that means somebody chose to buy, at market, with their money. */
export const PURCHASE_CODE = 'P';
export const SALE_CODE = 'S';

export interface Form4Transaction {
  /** Reporting owner's name, as filed. */
  owner: string;
  /** "SVP, General Counsel", "Director", or null when the filing says nothing. */
  ownerTitle: string | null;
  isDirector: boolean;
  isOfficer: boolean;
  isTenPercentOwner: boolean;
  /** ISO date of the transaction itself, not of the filing. */
  date: string;
  code: TransactionCode | string;
  /** Positive share count; direction is in `acquired`. */
  shares: number | null;
  pricePerShare: number | null;
  /** True for an acquisition (A), false for a disposal (D). */
  acquired: boolean;
  /** Table II rather than Table I: options, RSUs, convertibles. */
  derivative: boolean;
  securityTitle: string | null;
}

export interface Form4Filing {
  issuerSymbol: string | null;
  issuerName: string | null;
  /** `periodOfReport`, the date the form is about. */
  periodOfReport: string | null;
  transactions: Form4Transaction[];
}

/**
 * The tag soup is shallow and regular, so it is read with regexes rather than
 * by adding an XML parser to the dependency list.
 *
 * That trade is worth stating because it is usually the wrong one. It holds
 * here because the shape is fixed by the SEC's own schema, every value sits in
 * a `<value>` child one level down, there are no namespaces or attributes to
 * honour, and the alternative is a parser dependency in a project that has
 * deliberately kept very few. If Form 4 ever grows nesting worth the name,
 * this should become a real parse rather than a cleverer regex.
 */
const tagContent = (xml: string, tag: string): string | null => {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml);
  return match ? match[1] : null;
};

/**
 * A field's text, unwrapping the `<value>` child the SEC wraps most fields in.
 *
 * Some fields carry `<value>` plus a `<footnoteId/>` sibling; some carry the
 * text directly. Both appear in the same document.
 */
const field = (xml: string | null, tag: string): string | null => {
  if (!xml) return null;
  const raw = tagContent(xml, tag);
  if (raw === null) return null;
  const inner = tagContent(raw, 'value');
  const text = (inner ?? raw).replace(/<[^>]*>/g, '').trim();
  return text === '' ? null : text;
};

const num = (value: string | null): number | null => {
  if (value === null) return null;
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const flag = (xml: string | null, tag: string): boolean => {
  const value = field(xml, tag);
  return value === '1' || value?.toLowerCase() === 'true';
};

/** Every `<tag>…</tag>` block, for the repeating transaction elements. */
function blocks(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g'))].map(
    (m) => m[1],
  );
}

export function parseForm4(xml: string): Form4Filing {
  const issuer = tagContent(xml, 'issuer');
  const owner = tagContent(xml, 'reportingOwner');
  const relationship = owner ? tagContent(owner, 'reportingOwnerRelationship') : null;

  const person = {
    owner: field(owner, 'rptOwnerName') ?? 'Unknown',
    ownerTitle: field(relationship, 'officerTitle'),
    isDirector: flag(relationship, 'isDirector'),
    isOfficer: flag(relationship, 'isOfficer'),
    isTenPercentOwner: flag(relationship, 'isTenPercentOwner'),
  };

  const read = (block: string, derivative: boolean): Form4Transaction => {
    const coding = tagContent(block, 'transactionCoding');
    const amounts = tagContent(block, 'transactionAmounts');
    return {
      ...person,
      date: field(block, 'transactionDate') ?? '',
      code: field(coding, 'transactionCode') ?? '',
      shares: num(field(amounts, 'transactionShares')),
      pricePerShare: num(field(amounts, 'transactionPricePerShare')),
      // Absent on a few filings; a disposal is the safer default to assume
      // only when the code itself is a sale, so this keys off the code.
      acquired:
        (field(amounts, 'transactionAcquiredDisposedCode') ?? '').toUpperCase() === 'A',
      derivative,
      securityTitle: field(block, 'securityTitle'),
    };
  };

  /**
   * `nonDerivativeTable` also holds `nonDerivativeHolding` elements, which
   * report a position rather than a trade and carry no transaction date or
   * code. Selecting on the `…Transaction` tag skips them; selecting on the
   * table and looking for amounts would not.
   */
  const nonDerivative = blocks(xml, 'nonDerivativeTransaction').map((b) => read(b, false));
  const derivative = blocks(xml, 'derivativeTransaction').map((b) => read(b, true));

  return {
    issuerSymbol: field(issuer, 'issuerTradingSymbol'),
    issuerName: field(issuer, 'issuerName'),
    periodOfReport: field(xml, 'periodOfReport'),
    transactions: [...nonDerivative, ...derivative].filter((t) => t.date !== '' && t.code !== ''),
  };
}

export interface InsiderSummary {
  /** Open-market purchases only. */
  buys: number;
  sells: number;
  sharesBought: number;
  sharesSold: number;
  /** Signed cash value: purchases minus sales, where prices were reported. */
  netValue: number;
  /** Distinct people who made an open-market purchase. */
  buyers: string[];
  sellers: string[];
}

/**
 * Rolls transactions up into the one question the catalyst checkbox asks.
 *
 * Non-derivative only, and codes P and S only. Option exercises and vesting
 * are excluded on purpose: they are the company paying someone, not someone
 * choosing to own more of it, and mixing them in is what makes most
 * insider-activity summaries unreadable.
 */
export function summariseInsiderActivity(transactions: Form4Transaction[]): InsiderSummary {
  const summary: InsiderSummary = {
    buys: 0,
    sells: 0,
    sharesBought: 0,
    sharesSold: 0,
    netValue: 0,
    buyers: [],
    sellers: [],
  };
  const buyers = new Set<string>();
  const sellers = new Set<string>();

  for (const t of transactions) {
    if (t.derivative) continue;
    const shares = t.shares ?? 0;
    const value = shares * (t.pricePerShare ?? 0);

    if (t.code === PURCHASE_CODE) {
      summary.buys++;
      summary.sharesBought += shares;
      summary.netValue += value;
      buyers.add(t.owner);
    } else if (t.code === SALE_CODE) {
      summary.sells++;
      summary.sharesSold += shares;
      summary.netValue -= value;
      sellers.add(t.owner);
    }
  }

  summary.buyers = [...buyers].sort();
  summary.sellers = [...sellers].sort();
  return summary;
}
