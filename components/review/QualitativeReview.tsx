import { getLocale, getTranslations } from 'next-intl/server';
import { CATALYST_KEYS, SELL_SIGNAL_KEYS } from '@/lib/review/keys';
import { summariseHistory, type HistoryEntry } from '@/lib/review/history';
import type { Translation } from '@/lib/data/queries';
import { HistoryLog } from './HistoryLog';
import { ReviewForm } from './ReviewForm';
import { SaveButton } from './SaveButton';

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
  temporary: 'text-emerald-700 dark:text-emerald-300',
  structural: 'text-rose-700 dark:text-rose-300',
  not_assessed: 'text-slate-500 dark:text-slate-400',
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
  docs,
}: {
  symbol: string;
  mine: ReviewRecord | null;
  others: ReviewRecord[];
  /** My own saves, newest first. Empty for reviews written before it was kept. */
  history: HistoryEntry[];
  conditionsMet: number;
  conditionsApplicable: number;
  docs: Map<string, Translation>;
}) {
  const t = await getTranslations('review');
  const locale = await getLocale();

  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('title')}</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('intro')}</p>

      {/* The quantitative result restated, so the order of operations is plain. */}
      <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
        {t('checklistReminder', { met: conditionsMet, total: conditionsApplicable })}
      </p>

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
          <p className="mb-2 mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t('assessment.help')}
          </p>
          <div className="flex flex-wrap gap-3">
            {(['temporary', 'structural', 'not_assessed'] as const).map((value) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="assessment"
                  value={value}
                  defaultChecked={(mine?.assessment ?? 'not_assessed') === value}
                />
                <span>{t(`assessment.${value}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <CheckboxGroup
          legend={t('catalysts')}
          name="catalysts"
          keys={[...CATALYST_KEYS]}
          namespace="catalyst"
          checked={mine?.catalysts ?? []}
          docs={docs}
        />

        <CheckboxGroup
          legend={t('sellSignals')}
          name="sell_signals"
          keys={[...SELL_SIGNAL_KEYS]}
          namespace="sell_signal"
          checked={mine?.sell_signals ?? []}
          docs={docs}
        />

        <label className="block">
          <span className="text-sm font-medium">{t('marksLabel')}</span>
          <span className="mb-1 mt-1 block text-xs text-slate-500 dark:text-slate-400">
            {t('marksQuestion')}
          </span>
          <textarea
            name="marks_answer"
            rows={2}
            defaultValue={mine?.marks_answer ?? ''}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">{t('addNote')}</span>
          <textarea
            name="note"
            rows={3}
            placeholder={t('notesPlaceholder')}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
          />
        </label>

        <SaveButton idle={t('save')} busy={t('saving')} />

        {mine?.updated_at && (
          <p className="text-xs text-slate-400 dark:text-slate-500">
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
              className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900"
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
                <p className="mt-2 text-slate-600 dark:text-slate-300">{review.marks_answer}</p>
              )}
              {review.notes.slice(0, 3).map((note, i) => (
                <p key={i} className="mt-2 text-xs text-slate-500 dark:text-slate-400">
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
      <div className="mt-2 space-y-1.5">
        {keys.map((key) => {
          const doc = docs.get(`${namespace}:${key}`);
          return (
            <label key={key} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name={name}
                value={key}
                defaultChecked={checked.includes(key)}
                className="mt-1"
              />
              <span title={doc?.explanation}>{doc?.name ?? key}</span>
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
      ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
      : 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200';

  return (
    <div className="mt-2">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
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
      <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</h3>
      <ul className="mt-2 space-y-2">
        {notes.map((note, i) => (
          <li key={i} className="text-sm text-slate-600 dark:text-slate-300">
            <span className="mr-2 tabular-nums text-xs text-slate-400 dark:text-slate-500">
              {note.noted_on}
            </span>
            {note.note}
          </li>
        ))}
      </ul>
    </div>
  );
}
