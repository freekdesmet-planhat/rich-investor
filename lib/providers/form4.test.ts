/**
 * Reading Form 4.
 *
 * The anchor case is a real filing, checked in as a fixture: Apple's
 * 2026-09-17 Form 4 for Jennifer Newstead. It is a good anchor precisely
 * because it is ordinary — one sale, one option exercise, one lot of shares
 * withheld for tax, and the matching derivative leg — and because a naive
 * reading of it reports the opposite of the truth. The exercise acquired
 * 30,104 shares; nobody bought anything.
 *
 * Open-market purchases turn out to be rare enough that a scan of seventy-odd
 * recent filings across a dozen banks found none, so that path is covered by
 * a fixture built to the same shape rather than by a second live filing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseForm4, summariseInsiderActivity, PURCHASE_CODE } from './form4';

const real = readFileSync(join(__dirname, '__fixtures__', 'form4-aapl.xml'), 'utf8');

/** Same structure as the real filing, with an open-market purchase. */
const purchase = `<?xml version="1.0"?>
<ownershipDocument>
  <schemaVersion>X0609</schemaVersion>
  <documentType>4</documentType>
  <periodOfReport>2026-09-02</periodOfReport>
  <issuer>
    <issuerCik>0000000001</issuerCik>
    <issuerName>Example Bancorp</issuerName>
    <issuerTradingSymbol>EXB</issuerTradingSymbol>
  </issuer>
  <reportingOwner>
    <reportingOwnerId><rptOwnerName>Rivera Ana</rptOwnerName></reportingOwnerId>
    <reportingOwnerRelationship>
      <isDirector>1</isDirector>
      <isOfficer>0</isOfficer>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <securityTitle><value>Common Stock</value></securityTitle>
      <transactionDate><value>2026-09-02</value></transactionDate>
      <transactionCoding><transactionCode>P</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>2500</value></transactionShares>
        <transactionPricePerShare><value>18.40</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
    </nonDerivativeTransaction>
    <nonDerivativeHolding>
      <securityTitle><value>Common Stock</value></securityTitle>
      <postTransactionAmounts>
        <sharesOwnedFollowingTransaction><value>91000</value></sharesOwnedFollowingTransaction>
      </postTransactionAmounts>
    </nonDerivativeHolding>
  </nonDerivativeTable>
</ownershipDocument>`;

describe('parseForm4, against a real filing', () => {
  const filing = parseForm4(real);

  it('reads the issuer and the period', () => {
    expect(filing.issuerSymbol).toBe('AAPL');
    expect(filing.issuerName).toBe('Apple Inc.');
    expect(filing.periodOfReport).toBe('2026-09-15');
  });

  it('reads the reporting owner and their relationship', () => {
    expect(filing.transactions[0]).toMatchObject({
      owner: 'Newstead Jennifer',
      ownerTitle: 'SVP, GC and Government Affairs',
      isOfficer: true,
      isDirector: false,
    });
  });

  it('reads both tables, and marks which is which', () => {
    expect(filing.transactions.map((t) => `${t.code}${t.derivative ? '(d)' : ''}`)).toEqual([
      'S',
      'M',
      'F',
      'M(d)',
    ]);
  });

  it('reads shares, price and direction', () => {
    const [sale] = filing.transactions;
    expect(sale).toMatchObject({ shares: 1438, pricePerShare: 330.19, acquired: false });
    // The exercise acquired shares but reports no price, which is normal.
    expect(filing.transactions[1]).toMatchObject({ shares: 30104, pricePerShare: null, acquired: true });
  });
});

describe('summariseInsiderActivity', () => {
  /**
   * The case the whole feature turns on. This filing acquired 30,104 shares
   * through an option exercise and withheld 16,228 for tax. Counting
   * acquisitions would call that a 30,104-share insider purchase; it was a
   * vesting event and a sale.
   */
  it('does not mistake an option exercise for buying', () => {
    const summary = summariseInsiderActivity(parseForm4(real).transactions);

    expect(summary.buys).toBe(0);
    expect(summary.sharesBought).toBe(0);
    expect(summary.buyers).toEqual([]);
    expect(summary).toMatchObject({ sells: 1, sharesSold: 1438 });
    expect(summary.netValue).toBeCloseTo(-474_813.22, 2);
  });

  it('counts an open-market purchase, with its buyer', () => {
    const summary = summariseInsiderActivity(parseForm4(purchase).transactions);

    expect(summary).toMatchObject({ buys: 1, sells: 0, sharesBought: 2500, sharesSold: 0 });
    expect(summary.buyers).toEqual(['Rivera Ana']);
    expect(summary.netValue).toBeCloseTo(46_000, 2);
  });

  /** A holding is a position, not a trade, and carries no code or date. */
  it('ignores holdings reported alongside transactions', () => {
    expect(parseForm4(purchase).transactions).toHaveLength(1);
  });

  it('ignores the derivative table entirely', () => {
    const derivativeOnly = parseForm4(real).transactions.filter((t) => t.derivative);
    expect(derivativeOnly).toHaveLength(1);
    expect(summariseInsiderActivity(derivativeOnly)).toMatchObject({ buys: 0, sells: 0 });
  });

  it('survives a filing with nothing in it', () => {
    expect(parseForm4('<ownershipDocument></ownershipDocument>').transactions).toEqual([]);
    expect(summariseInsiderActivity([])).toMatchObject({ buys: 0, sells: 0, netValue: 0 });
  });

  it('names the purchase code once, so callers cannot guess at it', () => {
    expect(PURCHASE_CODE).toBe('P');
  });
});
