import { getLocale, getTranslations } from 'next-intl/server';
import { CATALYST_KEYS, SELL_SIGNAL_KEYS } from '@/lib/review/keys';
import { summariseHistory, type HistoryEntry } from '@/lib/review/history';
import type { Translation } from '@/lib/data/queries';
import { HistoryLog } from './HistoryLog';
import { InsiderActivity } from './InsiderActivity';
import { ReviewForm } from './ReviewForm';
import { SaveButton } from './SaveButton';
import { SectionHeading } from '../ui/Surface';

export interface ReviewRecord {
  user_id: string;
  symbol: string;
  assessment: 'temporary' | 'structural' | 'not_assessed';
  catalysts: string[];
  sell_signals: string[];
  marks_answer: string | null;
  assessed_at: string | null;
  updated_at: string;
  notes: Array<{ note: string; noted_on: string }>;
  /** Display label for whoever wrote it. */
  authorLabel: string;
  isMine: boolean;
}

const ASSESSMENT_TONE: Record<string, string> = {
  temporary: 'text-pass',
  structural: 'text-fail',
  not_assessed: 'text-ink-subtle',
};

/**
 * The judgement the app explicitly cannot make (section 8).
 *
 * Shown with the quantitative score above it, because the book's whole argument
 * is that the numbers are the *first* step and this is the last one. Each
 * household member keeps their own review; the other's is shown read-only
 * alongside, since disagreeing about a stock is the useful part.
 */
export async function QualitativeReview({
  symbol,
  mine,
  others,
  history,
  conditionsMet,
  conditionsApplicable,
  owns,
  docs,
}: {
  symbol: string;
  mine: ReviewRecord | null;
  others: ReviewRecord[];
  /** My own saves, newest first. Empty for reviews written before it was kept. */
  history: HistoryEntry[];
  conditionsMet: number;
  conditionsApplicable: number;
  /** Whether a holding is recorded — sell signals are only about a holding. */
  owns: boolean;
  docs: Map<string, Translation>;
}) {
  const t = await getTranslations('review');

  // The review is the step after the numbers, so it belongs to stocks that are
  // there or all but there — not every stock on the list (launch item 8). Two or
  // more conditions short, it collapses to a single line; one short, it previews;
  // all met, it opens.
  const missing = conditionsApplicable - conditionsMet;
  if (missing >= 2) {
    return (
      <section className="mt-8">
        <SectionHeading>{t('title')}</SectionHeading>
        <p className="text-ink-subtle mt-1 text-sm">{t('locked')}</p>
      </section>
    );
  }
  const isPreview = missing === 1;
  const tInsider = await getTranslations('insider');
  // Server component, so the labels are resolved here and handed to the
  // client block rather than it loading a second translation bundle.
  const insiderLabels = {
    heading: tInsider('heading'),
    window: tInsider.raw('window') as string,
    loading: tInsider('loading'),
    none: tInsider('none'),
    unavailable: tInsider('unavailable'),
    bought: tInsider.raw('bought') as string,
    noPurchases: tInsider('noPurchases'),
    sold: tInsider.raw('sold') as string,
    net: tInsider('net'),
    by: tInsider('by'),
    source: tInsider('source'),
  };
  const locale = await getLocale();

  return (
    <section className="mt-8">
      <SectionHeading>{t('title')}</SectionHeading>
      <p className="text-ink-subtle mt-1 text-sm">{t('intro')}</p>

      {/* The quantitative result restated, so the order of operations is plain. */}
      <p className="bg-surface-sunken border-line text-ink-muted mt-3 rounded-md border px-3 py-2 text-sm">
        {t('checklistReminder', { met: conditionsMet, total: conditionsApplicable })}
      </p>
      {/* One condition short: the review is a preview, so the reader knows the
          numbers have not all cleared yet (launch item 8). */}
      {isPreview && (
        <p className="border-near-line bg-near-wash text-near mt-2 rounded-md border px-3 py-2 text-sm">
          {t('preview')}
        </p>
      )}

      <ReviewForm
        symbol={symbol}
        locale={locale}
        labels={{
          saved: t('saved'),
          savedAt: t.raw('savedAt') as string,
          noteAdded: t('noteAdded'),
          unsaved: t('unsaved'),
          failed: t.raw('saveFailed') as string,
        }}
      >
        <fieldset>
          <legend className="text-sm font-medium">{t('assessment.label')}</legend>
          <p className="text-ink-subtle mb-2 mt-1 text-xs">
            {t('assessment.help')}
          </p>
          {/* Chips rather than 13px browser radios. The input is still a real
              radio — the server action reads exactly the same field — it is
              just visually hidden, with the label doing the drawing. That keeps
              the keyboard behaviour, the form semantics and the no-JS path
              intact while giving a target a thumb can actually hit. */}
          <div className="flex flex-wrap gap-2">
            {(['temporary', 'structural', 'not_assessed'] as const).map((value) => (
              <label key={value} className="cursor-pointer">
                <input
                  type="radio"
                  name="assessment"
                  value={value}
                  defaultChecked={(mine?.assessment ?? 'not_assessed') === value}
                  className="peer sr-only"
                />
                {/* Selected reads as an ink outline over a light tint, not solid
                    blue — blue is for links and focus only (item 2). "Not yet
                    assessed" is the empty default, so it keeps the unselected look
                    even while it is the checked value. */}
                <span
                  className={`border-line-strong text-ink-muted hover:bg-surface-hover inline-block rounded-full border px-3 py-2 text-sm transition peer-focus-visible:ring-2 peer-focus-visible:ring-accent ${
                    value === 'not_assessed'
                      ? ''
                      : 'peer-checked:border-ink peer-checked:bg-surface-sunken peer-checked:font-medium peer-checked:text-ink'
                  }`}
                >
                  {t(`assessment.${value}`)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <CheckboxGroup
            legend={t('catalysts')}
            name="catalysts"
            keys={[...CATALYST_KEYS]}
            namespace="catalyst"
            checked={mine?.catalysts ?? []}
            docs={docs}
          />
          {/* Directly under the catalysts, because one of them — "management
              is buying its own shares" — is a question the filings answer.
              Until now it asked the reader to go and check elsewhere. */}
          <InsiderActivity symbol={symbol} locale={locale} labels={insiderLabels} />
        </div>

        {/* Sell signals are questions about a holding, so they appear only once
            ownership is recorded (launch item 8); otherwise a short note points
            to the "I own this" block above. */}
        {owns ? (
          <CheckboxGroup
            legend={t('sellSignals')}
            name="sell_signals"
            keys={[...SELL_SIGNAL_KEYS]}
            namespace="sell_signal"
            checked={mine?.sell_signals ?? []}
            docs={docs}
          />
        ) : (
          <p className="text-ink-subtle text-sm">{t('sellNeedsPosition')}</p>
        )}

        <label className="block">
          <span className="text-sm font-medium">{t('marksLabel')}</span>
          <span className="text-ink-subtle mb-1 mt-1 block text-xs">
            {t('marksQuestion')}
          </span>
          <textarea
            name="marks_answer"
            rows={2}
            defaultValue={mine?.marks_answer ?? ''}
            className="border-line-strong w-full rounded-md border bg-surface px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">{t('addNote')}</span>
          <textarea
            name="note"
            rows={3}
            placeholder={t('notesPlaceholder')}
            className="border-line-strong mt-1 w-full rounded-md border bg-surface px-3 py-2 text-sm"
          />
        </label>

        <SaveButton idle={t('save')} busy={t('saving')} />

        {mine?.updated_at && (
          <p className="text-ink-faint text-xs">
            {t('lastUpdated', { date: mine.updated_at.slice(0, 10) })}
          </p>
        )}
      </ReviewForm>

      {mine && mine.notes.length > 0 && (
        <NoteLog title={t('notes')} notes={mine.notes} />
      )}

      {history.length > 0 && (
        <HistoryLog
          changes={summariseHistory(history)}
          docs={docs}
          labels={{
            title: t('history.title'),
            intro: t('history.intro'),
            first: t('history.first'),
            changed: t.raw('history.changed') as string,
            unchanged: t('history.unchanged'),
            added: t('history.added'),
            removed: t('history.removed'),
            marks: t('history.marks'),
            assessment: {
              temporary: t('assessment.temporary'),
              structural: t('assessment.structural'),
              not_assessed: t('assessment.not_assessed'),
            },
          }}
        />
      )}

      {others.length > 0 && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {others.map((review) => (
            <article
              key={review.user_id}
              className="bg-surface-sunken border-line rounded-lg border p-3 text-sm"
            >
              <h3 className="font-medium">{t('theirs', { email: review.authorLabel })}</h3>
              <p className={`mt-1 ${ASSESSMENT_TONE[review.assessment]}`}>
                {t(`assessment.${review.assessment}`)}
              </p>

              {review.catalysts.length > 0 && (
                <ChipList
                  label={t('catalysts')}
                  keys={review.catalysts}
                  namespace="catalyst"
                  docs={docs}
                  tone="emerald"
                />
              )}
              {review.sell_signals.length > 0 && (
                <ChipList
                  label={t('sellSignals')}
                  keys={review.sell_signals}
                  namespace="sell_signal"
                  docs={docs}
                  tone="rose"
                />
              )}

              {review.marks_answer && (
                <p className="text-ink-muted mt-2">{review.marks_answer}</p>
              )}
              {review.notes.slice(0, 3).map((note, i) => (
                <p key={i} className="text-ink-subtle mt-2 text-xs">
                  <span className="tabular-nums">{note.noted_on}</span> — {note.note}
                </p>
              ))}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function CheckboxGroup({
  legend,
  name,
  keys,
  namespace,
  checked,
  docs,
}: {
  legend: string;
  name: string;
  keys: string[];
  namespace: string;
  checked: string[];
  docs: Map<string, Translation>;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{legend}</legend>
      {/* Same treatment as the assessment: a real checkbox, visually hidden,
          with the label drawn as a toggle chip. Sixteen of these were 13px
          squares — well under the 24px a thumb needs — in a form whose whole
          purpose is to be filled in on the sofa. */}
      <div className="mt-2 flex flex-wrap gap-2">
        {keys.map((key) => {
          const doc = docs.get(`${namespace}:${key}`);
          const tone =
            namespace === 'sell_signal'
              ? 'peer-checked:border-fail-line peer-checked:bg-fail-wash peer-checked:text-fail'
              : 'peer-checked:border-pass-line peer-checked:bg-pass-wash peer-checked:text-pass';

          return (
            <label key={key} className="cursor-pointer" title={doc?.explanation}>
              <input
                type="checkbox"
                name={name}
                value={key}
                defaultChecked={checked.includes(key)}
                className="peer sr-only"
              />
              <span
                className={`inline-block rounded-full border border-line-strong px-3 py-2 text-sm text-ink-muted transition hover:bg-surface-hover peer-focus-visible:ring-2 peer-focus-visible:ring-accent ${tone}`}
              >
                {doc?.name ?? key}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function ChipList({
  label,
  keys,
  namespace,
  docs,
  tone,
}: {
  label: string;
  keys: string[];
  namespace: string;
  docs: Map<string, Translation>;
  tone: 'emerald' | 'rose';
}) {
  const classes =
    tone === 'emerald'
      ? 'bg-pass-wash text-pass'
      : 'bg-fail-wash text-fail';

  return (
    <div className="mt-2">
      <p className="text-ink-subtle text-xs">{label}</p>
      <ul className="mt-1 flex flex-wrap gap-1">
        {keys.map((key) => (
          <li key={key} className={`rounded px-1.5 py-0.5 text-xs ${classes}`}>
            {docs.get(`${namespace}:${key}`)?.name ?? key}
          </li>
        ))}
      </ul>
    </div>
  );
}

function NoteLog({
  title,
  notes,
}: {
  title: string;
  notes: Array<{ note: string; noted_on: string }>;
}) {
  return (
    <div className="mt-4">
      <h3 className="text-ink-muted text-sm font-medium">{title}</h3>
      <ul className="mt-2 space-y-2">
        {notes.map((note, i) => (
          <li key={i} className="text-ink-muted text-sm">
            <span className="text-ink-faint mr-2 tabular-nums text-xs">
              {note.noted_on}
            </span>
            {note.note}
          </li>
        ))}
      </ul>
    </div>
  );
}
