/**
 * The daily digest (NEW-01).
 *
 * The premise of the app is that a quality company occasionally falls far
 * enough to be worth buying, and that you want to be there when it does.
 * Until now the only way to learn that was to open the site and read a counter,
 * which is the one job the app was not doing.
 *
 * The existing buy-signal alert fires per ticker the moment it crosses. This is
 * the other half: one mail per person per day saying what moved — what flipped
 * to buy-worthy, what changed status in either direction, and what is a single
 * condition away from qualifying.
 *
 * Nothing is sent on a quiet day. A daily mail that usually says "no change"
 * teaches the reader to ignore it, and then it fails at the one job it has.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMailer, resolveRecipients, type Mailer } from '@/lib/email/mailer';
import { CONDITION_LABEL } from '@/lib/signal/explain';
import { renderDigestHtml } from '@/lib/templates/digest-email';
import type { SignalStatus } from '@/lib/signal/buyWorthy';
import type { Lang } from '@/lib/i18n/config';

export interface DigestEntry {
  symbol: string;
  name: string | null;
  status: SignalStatus;
  /** What it was the last time it was evaluated; null on a first evaluation. */
  previousStatus: SignalStatus | null;
  conditionsMet: number;
  conditionsApplicable: number;
  /** Keys of the applicable conditions that did not pass. */
  missing: string[];
  /**
   * When this company next reports, when that is known and still ahead.
   *
   * Optional, and absent for roughly a sixth of the watchlist: the quote
   * provider does not carry a date for every listing and does not always roll
   * it forward after a company reports. `upcomingEarnings` filters the stale
   * ones out, so anything present here is genuinely in the future.
   */
  nextEarningsDate?: string | null;
  /**
   * Valuation and quality figures, for the highlights in the HTML mail.
   *
   * Optional because the digest must still work from the nightly pipeline,
   * which has them, and from anywhere that only knows the status.
   */
  peg?: number | null;
  forwardPeg?: number | null;
  roe?: number | null;
  roa?: number | null;
  drawdown?: number | null;
  /** The stored AI summary in the reader's language, if one exists. */
  thesis?: string | null;
}

export interface Digest {
  subject: string;
  body: string;
  /** What the digest is about, for the log and for tests. */
  counts: { flipped: number; changed: number; oneAway: number };
}

const STATUS_LABEL: Record<SignalStatus, { en: string; nl: string }> = {
  buy_worthy: { en: 'buy-worthy', nl: 'koopwaardig' },
  almost: { en: 'almost there', nl: 'bijna zover' },
  watching: { en: 'watching', nl: 'in de gaten houden' },
};

const COPY = {
  subject: {
    flipped: {
      en: (n: number) => `${n} stock${n === 1 ? '' : 's'} now buy-worthy`,
      nl: (n: number) => `${n} aande${n === 1 ? 'el' : 'len'} nu koopwaardig`,
    },
    changes: {
      en: (n: number) => `${n} change${n === 1 ? '' : 's'} on your watchlist`,
      nl: (n: number) => `${n} wijziging${n === 1 ? '' : 'en'} op je volglijst`,
    },
    oneAway: {
      en: (n: number) => `${n} stock${n === 1 ? '' : 's'} one condition away`,
      nl: (n: number) => `${n} aande${n === 1 ? 'el' : 'len'} één voorwaarde verwijderd`,
    },
  },
  heading: {
    flipped: { en: 'Now buy-worthy', nl: 'Nu koopwaardig' },
    changed: { en: 'Changed', nl: 'Gewijzigd' },
    oneAway: { en: 'One condition away', nl: 'Nog één voorwaarde' },
  },
  intro: {
    en: (date: string) => `What moved on your watchlist on ${date}.`,
    nl: (date: string) => `Wat er op ${date} op je volglijst is veranderd.`,
  },
  closing: {
    en: 'This is a personal analysis tool, not investment advice.',
    nl: 'Dit is een persoonlijk analysehulpmiddel, geen beleggingsadvies.',
  },
  conditionsMet: {
    en: (met: number, total: number) => `${met} of ${total} conditions met`,
    nl: (met: number, total: number) => `${met} van ${total} voorwaarden voldaan`,
  },
  missing: {
    en: (what: string) => `missing: ${what}`,
    nl: (what: string) => `ontbreekt: ${what}`,
  },
} as const;

const named = (entry: DigestEntry) =>
  entry.name ? `${entry.symbol} (${entry.name})` : entry.symbol;

/**
 * Whether a ticker is a single applicable condition short.
 *
 * Counted from the conditions rather than from the status: "almost there" also
 * requires the first three conditions to hold, so a stock can be one condition
 * away without carrying that badge, and the reader wants to know either way.
 */
function isOneAway(entry: DigestEntry): boolean {
  return (
    entry.status !== 'buy_worthy' && entry.conditionsApplicable - entry.conditionsMet === 1
  );
}

/**
 * Builds one digest, or nothing when there is nothing to say.
 *
 * Pure: no database, no mailer, no clock. The decision of whether a day is
 * worth an email is the part most worth testing, and it is decided here.
 */
export function buildDigest(
  entries: DigestEntry[],
  asOf: string,
  lang: Lang,
): Digest | null {
  const flipped = entries.filter(
    (e) => e.status === 'buy_worthy' && e.previousStatus !== 'buy_worthy',
  );
  // A status change that is not the flip above, and not a first evaluation —
  // there is no "change" to report about a ticker seen for the first time.
  const changed = entries.filter(
    (e) =>
      e.previousStatus !== null &&
      e.previousStatus !== e.status &&
      !flipped.includes(e),
  );
  const oneAway = entries.filter(isOneAway);

  const counts = { flipped: flipped.length, changed: changed.length, oneAway: oneAway.length };
  if (counts.flipped + counts.changed + counts.oneAway === 0) return null;

  // The subject leads with the most important thing that happened, so the
  // digest is triageable from a notification without opening it.
  const subject =
    counts.flipped > 0
      ? COPY.subject.flipped[lang](counts.flipped)
      : counts.changed > 0
        ? COPY.subject.changes[lang](counts.changed)
        : COPY.subject.oneAway[lang](counts.oneAway);

  const lines: string[] = [COPY.intro[lang](asOf), ''];

  if (flipped.length > 0) {
    lines.push(`${COPY.heading.flipped[lang]}:`);
    for (const e of flipped) {
      lines.push(
        `  - ${named(e)} — ${COPY.conditionsMet[lang](e.conditionsMet, e.conditionsApplicable)}`,
      );
    }
    lines.push('');
  }

  if (changed.length > 0) {
    lines.push(`${COPY.heading.changed[lang]}:`);
    for (const e of changed) {
      const from = STATUS_LABEL[e.previousStatus!][lang];
      const to = STATUS_LABEL[e.status][lang];
      lines.push(`  - ${named(e)}: ${from} → ${to}`);
    }
    lines.push('');
  }

  if (oneAway.length > 0) {
    lines.push(`${COPY.heading.oneAway[lang]}:`);
    for (const e of oneAway) {
      // Naming the blocking condition is the point: it saves opening the stock
      // page to find out which one it was.
      const what = e.missing.map((key) => CONDITION_LABEL[key]?.[lang] ?? key).join(', ');
      lines.push(
        `  - ${named(e)} — ${what ? COPY.missing[lang](what) : COPY.conditionsMet[lang](e.conditionsMet, e.conditionsApplicable)}`,
      );
    }
    lines.push('');
  }

  lines.push(COPY.closing[lang]);

  return { subject, body: lines.join('\n'), counts };
}

export interface DigestOutcome {
  recipient: string;
  state: 'sent' | 'failed' | 'skipped';
  simulated: boolean;
  error?: string;
}

/**
 * Sends the digest, at most once per recipient per day.
 *
 * Follows the buy-signal alert exactly: the row is claimed before the send, so
 * a crash mid-send leaves a record rather than a silent gap, and a unique
 * violation means today's digest already went out. A simulated send is recorded
 * as skipped, never as sent — the log is an audit trail and must not claim an
 * email left the building when no key was configured.
 */
export async function sendDailyDigest(
  client: SupabaseClient,
  entries: DigestEntry[],
  asOf: string,
  options: {
    mailer?: Mailer;
    onProgress?: (message: string) => void;
    /** Absolute origin for the links. Without one, the mail goes text-only. */
    baseUrl?: string;
    /**
     * Adjusts the entries for one reader's language.
     *
     * The AI summary exists per language, so which one belongs in the mail is
     * not known until the recipient is. Everything else is language-neutral and
     * passed through untouched.
     */
    perRecipient?: (lang: Lang) => DigestEntry[];
  } = {},
): Promise<DigestOutcome[]> {
  const log = options.onProgress ?? (() => {});
  if (entries.length === 0) return [];

  const recipients = await resolveRecipients(client, log);
  if (recipients.length === 0) {
    log('no digest recipients configured — nothing sent');
    return [];
  }

  const mailer = options.mailer ?? createMailer();
  if (!mailer.canSend) log('RESEND_API_KEY is not set — the digest will be logged, not sent');

  const outcomes: DigestOutcome[] = [];

  for (const recipient of recipients) {
    // Built per recipient: each member reads in their own language.
    const forReader = options.perRecipient?.(recipient.lang) ?? entries;
    const digest = buildDigest(forReader, asOf, recipient.lang);
    if (!digest) {
      log(`nothing to report for ${recipient.email} — no digest sent`);
      continue;
    }

    const { error: claimError } = await client.from('notifications_log').insert({
      user_id: recipient.userId,
      kind: 'daily_digest',
      symbol: null,
      as_of: asOf,
      recipient: recipient.email,
      subject: digest.subject,
      body: digest.body,
      lang: recipient.lang,
      state: 'sent',
    });

    if (claimError) {
      // 23505 is unique_violation: today's digest already went out.
      if (claimError.code === '23505') {
        outcomes.push({ recipient: recipient.email, state: 'skipped', simulated: false });
        continue;
      }
      outcomes.push({
        recipient: recipient.email,
        state: 'failed',
        simulated: false,
        error: claimError.message,
      });
      continue;
    }

    // The plain text is the record; the HTML is the same facts, rendered. A
    // mail client that refuses the HTML still gets a complete digest.
    const baseUrl = options.baseUrl ?? process.env.NEXT_PUBLIC_SITE_URL ?? '';
    const html = baseUrl
      ? renderDigestHtml({
          entries: forReader,
          asOf,
          lang: recipient.lang,
          baseUrl,
          subject: digest.subject,
        })
      : undefined;

    const result = await mailer.send({
      to: recipient.email,
      subject: digest.subject,
      text: digest.body,
      html,
    });

    if (!result.ok) {
      // Drop the claim rather than marking it failed. The row is what makes a
      // second run skip, so leaving a failed one behind means the send is never
      // retried — one transient refusal and that reader silently gets no digest
      // that day. Removing it lets the next run try again, and the dedupe still
      // holds for a send that actually succeeded.
      await client
        .from('notifications_log')
        .delete()
        .eq('recipient', recipient.email)
        .eq('kind', 'daily_digest')
        .eq('as_of', asOf);
    } else {
      const patch: Record<string, unknown> | null = result.simulated
        ? { state: 'skipped', error: 'simulated — RESEND_API_KEY not set' }
        : result.providerId
          ? { provider_id: result.providerId }
          : null;

      if (patch) {
        await client
          .from('notifications_log')
          .update(patch)
          .eq('recipient', recipient.email)
          .eq('kind', 'daily_digest')
          .eq('as_of', asOf);
      }
    }

    outcomes.push({
      recipient: recipient.email,
      state: result.ok ? 'sent' : 'failed',
      simulated: result.simulated,
      error: result.error,
    });

    log(
      `${result.ok ? (result.simulated ? 'logged' : 'sent') : 'FAILED'} digest -> ` +
        `${recipient.email} (${digest.counts.flipped} flipped, ${digest.counts.changed} changed, ` +
        `${digest.counts.oneAway} one away)${result.error ? `: ${result.error}` : ''}`,
    );
  }

  return outcomes;
}
