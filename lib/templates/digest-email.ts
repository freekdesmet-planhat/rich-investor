/**
 * The HTML body of the daily digest.
 *
 * Written for mail clients, not browsers, which is why it looks like 2004:
 * a table for layout, every style inline, no flexbox, no grid, no <style>
 * block and no external stylesheet. Outlook renders with Word's engine and
 * Gmail strips <head>, so anything cleverer degrades to unstyled text.
 *
 * The plain-text body remains the source of record — `buildDigest` produces it,
 * this renders the same facts — and both parts are always sent together.
 */
import { CONDITION_LABEL } from '@/lib/signal/explain';
import type { DigestEntry } from '@/lib/pipeline/digest';
import type { SignalStatus } from '@/lib/signal/buyWorthy';
import type { Lang } from '@/lib/i18n/config';
import { reportingSoon } from '@/lib/data/earnings';

/** Brand-neutral, and legible on the white background every client forces. */
const COLOR = {
  ink: '#0f172a',
  muted: '#64748b',
  faint: '#94a3b8',
  rule: '#e2e8f0',
  panel: '#f8fafc',
  green: '#047857',
  greenBg: '#ecfdf5',
  amber: '#b45309',
  amberBg: '#fffbeb',
  slate: '#475569',
  slateBg: '#f1f5f9',
} as const;

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const BADGE: Record<SignalStatus, { fg: string; bg: string; en: string; nl: string }> = {
  buy_worthy: { fg: COLOR.green, bg: COLOR.greenBg, en: 'Buy-worthy', nl: 'Koopwaardig' },
  almost: { fg: COLOR.amber, bg: COLOR.amberBg, en: 'Almost there', nl: 'Bijna zover' },
  watching: { fg: COLOR.slate, bg: COLOR.slateBg, en: 'Watching', nl: 'Volgen' },
};

const COPY = {
  preheader: {
    en: 'What moved on your watchlist',
    nl: 'Wat er op je volglijst is veranderd',
  },
  heading: {
    flipped: { en: 'Now buy-worthy', nl: 'Nu koopwaardig' },
    changed: { en: 'Changed', nl: 'Gewijzigd' },
    oneAway: { en: 'One condition away', nl: 'Nog één voorwaarde' },
  },
  conditions: {
    en: (met: number, total: number) => `${met} of ${total} conditions met`,
    nl: (met: number, total: number) => `${met} van ${total} voorwaarden voldaan`,
  },
  missing: { en: 'Missing', nl: 'Ontbreekt' },
  reporting: {
    heading: { en: 'Reporting soon', nl: 'Binnenkort cijfers' },
    today: { en: 'today', nl: 'vandaag' },
    tomorrow: { en: 'tomorrow', nl: 'morgen' },
    inDays: {
      en: (d: number) => `in ${d} days`,
      nl: (d: number) => `over ${d} dagen`,
    },
  },
  open: { en: 'Open analysis', nl: 'Analyse openen' },
  disclaimer: {
    en: 'This is a personal analysis tool, not investment advice.',
    nl: 'Dit is een persoonlijk analysehulpmiddel, geen beleggingsadvies.',
  },
  metrics: {
    peg: { en: 'PEG', nl: 'PEG' },
    pegForward: { en: 'PEG (forward)', nl: 'PEG (verwacht)' },
    roe: { en: 'ROE', nl: 'ROE' },
    roa: { en: 'ROA', nl: 'ROA' },
    drawdown: { en: 'Off 5y high', nl: 'Onder 5-jaarstop' },
  },
} as const;

/**
 * Escapes text for HTML.
 *
 * Company names arrive from a market-data provider, and a stray `&` or `<`
 * would otherwise break the markup — or worse, inject into it.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const num = (value: number | null | undefined, lang: Lang, digits = 2) =>
  value == null || !Number.isFinite(value)
    ? null
    : lang === 'nl'
      ? value.toFixed(digits).replace('.', ',')
      : value.toFixed(digits);

const pct = (value: number | null | undefined, lang: Lang) =>
  value == null || !Number.isFinite(value)
    ? null
    : `${num(value * 100, lang, 1)}%`;

function badge(status: SignalStatus, lang: Lang): string {
  const b = BADGE[status];
  return (
    `<span style="display:inline-block;padding:3px 8px;border-radius:9999px;` +
    `background:${b.bg};color:${b.fg};font-size:12px;font-weight:600;` +
    `font-family:${FONT};white-space:nowrap;">${escapeHtml(b[lang])}</span>`
  );
}

/** The small figures under a highlighted row. Omitted entirely when unknown. */
function metrics(entry: DigestEntry, lang: Lang): string {
  const parts: string[] = [];
  const add = (label: string, value: string | null) => {
    if (value) parts.push(`${escapeHtml(label)}&nbsp;${escapeHtml(value)}`);
  };

  add(COPY.metrics.peg[lang], num(entry.peg, lang));
  add(COPY.metrics.pegForward[lang], num(entry.forwardPeg, lang));
  add(COPY.metrics.roe[lang], pct(entry.roe, lang));
  add(COPY.metrics.roa[lang], pct(entry.roa, lang));
  add(COPY.metrics.drawdown[lang], pct(entry.drawdown == null ? null : Math.abs(entry.drawdown), lang));

  if (parts.length === 0) return '';
  return (
    `<div style="margin-top:6px;font-size:12px;color:${COLOR.muted};font-family:${FONT};">` +
    parts.join(`<span style="color:${COLOR.faint};"> · </span>`) +
    `</div>`
  );
}

function ctaButton(href: string, label: string): string {
  // A padded anchor rather than a <button>: buttons do not render in mail.
  return (
    `<a href="${escapeHtml(href)}" style="display:inline-block;padding:8px 14px;` +
    `background:${COLOR.ink};color:#ffffff;text-decoration:none;border-radius:6px;` +
    `font-size:13px;font-weight:600;font-family:${FONT};">${escapeHtml(label)}</a>`
  );
}

function row(entry: DigestEntry, lang: Lang, baseUrl: string, options: { showMissing?: boolean } = {}): string {
  const href = `${baseUrl}/stock/${encodeURIComponent(entry.symbol)}`;
  const name = entry.name ? ` <span style="color:${COLOR.muted};font-weight:400;">${escapeHtml(entry.name)}</span>` : '';

  const missing =
    options.showMissing && entry.missing.length > 0
      ? `<div style="margin-top:4px;font-size:13px;color:${COLOR.muted};font-family:${FONT};">` +
        `${escapeHtml(COPY.missing[lang])}: ` +
        escapeHtml(entry.missing.map((k) => CONDITION_LABEL[k]?.[lang] ?? k).join(', ')) +
        `</div>`
      : '';

  const thesis = entry.thesis
    ? `<div style="margin-top:8px;padding:10px 12px;background:${COLOR.panel};` +
      `border-radius:6px;font-size:13px;line-height:1.5;color:${COLOR.slate};font-family:${FONT};">` +
      `${escapeHtml(entry.thesis.split('\n\n')[0].slice(0, 320))}</div>`
    : '';

  return `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid ${COLOR.rule};">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="font-family:${FONT};font-size:15px;font-weight:600;color:${COLOR.ink};">
              ${escapeHtml(entry.symbol)}${name}
            </td>
            <td align="right" style="white-space:nowrap;">${badge(entry.status, lang)}</td>
          </tr>
        </table>
        <div style="margin-top:4px;font-size:13px;color:${COLOR.muted};font-family:${FONT};">
          ${escapeHtml(COPY.conditions[lang](entry.conditionsMet, entry.conditionsApplicable))}
        </div>
        ${missing}
        ${metrics(entry, lang)}
        ${thesis}
        <div style="margin-top:10px;">${ctaButton(href, COPY.open[lang])}</div>
      </td>
    </tr>`;
}

function section(title: string, entries: DigestEntry[], lang: Lang, baseUrl: string, showMissing = false): string {
  if (entries.length === 0) return '';
  return `
    <tr>
      <td style="padding-top:22px;">
        <div style="font-family:${FONT};font-size:13px;font-weight:700;text-transform:uppercase;
                    letter-spacing:0.04em;color:${COLOR.faint};">${escapeHtml(title)}</div>
      </td>
    </tr>
    ${entries.map((e) => row(e, lang, baseUrl, { showMissing })).join('')}`;
}

/**
 * The watchlist names about to report.
 *
 * Deliberately a compact line each rather than the full row treatment: most
 * of these names already appear above in one of the other sections, and a
 * second full entry for the same company would read as two separate pieces of
 * news. This section answers one question — what is about to be answered for
 * me — so it carries a ticker and a date and nothing else.
 */
function reportingSection(entries: DigestEntry[], lang: Lang, baseUrl: string): string {
  const soon = reportingSoon(
    entries.map((e) => ({ ...e, nextEarningsDate: e.nextEarningsDate })),
  );
  if (soon.length === 0) return '';

  const when = (days: number) =>
    days === 0
      ? COPY.reporting.today[lang]
      : days === 1
        ? COPY.reporting.tomorrow[lang]
        : COPY.reporting.inDays[lang](days);

  return `
    <tr>
      <td style="padding-top:22px;">
        <div style="font-family:${FONT};font-size:13px;font-weight:700;text-transform:uppercase;
                    letter-spacing:0.04em;color:${COLOR.faint};">${escapeHtml(COPY.reporting.heading[lang])}</div>
      </td>
    </tr>
    <tr>
      <td style="padding-top:8px;font-family:${FONT};font-size:14px;color:${COLOR.ink};">
        ${soon
          .map(
            (e) =>
              `<div style="padding:3px 0;">
                 <a href="${baseUrl}/stock/${encodeURIComponent(e.symbol)}"
                    style="color:${COLOR.ink};text-decoration:none;font-weight:600;">${escapeHtml(e.symbol)}</a>
                 <span style="color:${COLOR.faint};">&nbsp;${escapeHtml(e.earnings.date)} · ${escapeHtml(when(e.earnings.daysAway))}</span>
               </div>`,
          )
          .join('')}
      </td>
    </tr>`;
}

export interface DigestHtmlInput {
  entries: DigestEntry[];
  asOf: string;
  lang: Lang;
  /** Absolute origin, so links work from a mail client. */
  baseUrl: string;
  subject: string;
}

/**
 * Renders the digest as HTML.
 *
 * Takes the same entries `buildDigest` sorted into sections, and splits them
 * the same way, so the two bodies of one email cannot disagree about what
 * happened.
 */
export function renderDigestHtml({ entries, asOf, lang, baseUrl, subject }: DigestHtmlInput): string {
  const flipped = entries.filter((e) => e.status === 'buy_worthy' && e.previousStatus !== 'buy_worthy');
  const changed = entries.filter(
    (e) => e.previousStatus !== null && e.previousStatus !== e.status && !flipped.includes(e),
  );
  const oneAway = entries.filter(
    (e) => e.status !== 'buy_worthy' && e.conditionsApplicable - e.conditionsMet === 1,
  );

  const origin = baseUrl.replace(/\/+$/, '');

  return `<!doctype html>
<html lang="${lang}">
  <body style="margin:0;padding:0;background:${COLOR.panel};">
    <!-- Preheader: the grey line clients show beside the subject. -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      ${escapeHtml(COPY.preheader[lang])} — ${escapeHtml(asOf)}
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background:${COLOR.panel};padding:24px 12px;">
      <tr>
        <td align="center">
          <!-- 600px is the width every mail client agrees on. -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"
                 style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${COLOR.rule};
                        border-radius:10px;padding:24px;">
            <tr>
              <td style="font-family:${FONT};">
                <div style="font-size:18px;font-weight:700;color:${COLOR.ink};">${escapeHtml(subject)}</div>
                <div style="margin-top:4px;font-size:13px;color:${COLOR.muted};">
                  ${escapeHtml(COPY.preheader[lang])} — ${escapeHtml(asOf)}
                </div>
              </td>
            </tr>

            ${section(COPY.heading.flipped[lang], flipped, lang, origin)}
            ${section(COPY.heading.changed[lang], changed, lang, origin)}
            ${section(COPY.heading.oneAway[lang], oneAway, lang, origin, true)}
            ${reportingSection(entries, lang, origin)}

            <tr>
              <td style="padding-top:22px;font-family:${FONT};font-size:12px;color:${COLOR.faint};">
                ${escapeHtml(COPY.disclaimer[lang])}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
