/**
 * The mandatory plain-language "why" (section 7).
 *
 * Templated from the computed values, never a static sentence, and always
 * produced in both languages together. The same function writes the detail
 * page, the notification email and the suggestion card, so the UI and the email
 * can never drift apart.
 *
 * The Dutch is written first and stays close to the book's own phrasing; the
 * English is a faithful, natural translation rather than a literal one.
 */
import type { RatioKey, RatioResult } from '@/lib/ratios/engine';
import type { ConditionResult, SignalResult } from './buyWorthy';

/**
 * Which part of the answer a sentence belongs to.
 *
 * The generator has always assembled the explanation from self-contained
 * sentences, each about one thing, and then thrown that structure away in a
 * join. Keeping it is what lets the page show a verdict and three short lists
 * instead of a twelve-line paragraph nobody finishes on a phone — while the
 * email and the suggestion cards keep the joined prose, unchanged to the byte.
 */
export type WhySection = 'verdict' | 'passes' | 'missing' | 'check';

export interface WhyPart {
  section: WhySection;
  text: string;
}

export interface Explanation {
  en: string;
  nl: string;
}

type Lang = 'en' | 'nl';

const pct = (v: number | null | undefined, lang: Lang, digits = 0): string => {
  if (v == null) return lang === 'nl' ? 'onbekend' : 'unknown';
  const n = (v * 100).toFixed(digits);
  return `${lang === 'nl' ? n.replace('.', ',') : n}%`;
};

const num = (v: number | null | undefined, lang: Lang, digits = 2): string => {
  if (v == null) return lang === 'nl' ? 'onbekend' : 'unknown';
  const n = v.toFixed(digits);
  return lang === 'nl' ? n.replace('.', ',') : n;
};

const billions = (v: number | null | undefined, lang: Lang): string => {
  if (v == null) return lang === 'nl' ? 'onbekend' : 'unknown';
  const n = (v / 1e9).toFixed(1);
  return lang === 'nl' ? `$ ${n.replace('.', ',')} mld` : `$${n}B`;
};

/** Shared with the daily digest, which names the blocking condition too. */
export const CONDITION_LABEL: Record<string, { en: string; nl: string }> = {
  focus_sector: { en: 'focus sector', nl: 'focussector' },
  lynch_category: { en: 'growth category', nl: 'groeicategorie' },
  market_cap: { en: 'market capitalisation', nl: 'beurswaarde' },
  drawdown: { en: 'decline from the 5-year high', nl: 'daling vanaf de 5-jaarstop' },
  peg: { en: 'PEG ratio', nl: 'PEG-ratio' },
  pe: { en: 'price/earnings ratio', nl: 'koers-winstverhouding' },
  returns: { en: 'return on equity and assets', nl: 'rendement op eigen vermogen en activa' },
  cash_flow: { en: 'cash flow quality', nl: 'kwaliteit van de kasstroom' },
  debt: { en: 'debt level', nl: 'schuldniveau' },
};


export interface ExplainInput {
  symbol: string;
  name?: string | null;
  signal: SignalResult;
  ratios: Record<RatioKey, RatioResult>;
  /** Industry rank, when known (5.19). */
  industryRank?: { rank: number; industry: string; leadOverSecond?: number | null } | null;
}

/**
 * Builds the PEG sentence, which carries the most nuance in the whole
 * explanation.
 *
 * A forward-only pass rests on analyst consensus the reported results have not
 * confirmed yet, so it is stated plainly and pointed at the qualitative review
 * by name — that block exists precisely to answer whether the dip is temporary
 * or structural.
 */
function pegSentences(condition: ConditionResult, lang: Lang): WhyPart[] {
  const d = condition.detail as {
    trailingPeg?: number | null;
    forwardPeg?: number | null;
    threshold?: number;
    basis?: string;
    forwardGrowth?: number | null;
    epsCagr?: number | null;
    outlookDeteriorating?: boolean;
  };
  const threshold = d.threshold ?? 1;
  const out: WhyPart[] = [];

  if (d.basis === 'both') {
    out.push({ section: 'passes', text:
      lang === 'nl'
        ? `De PEG-ratio ligt zowel op basis van de gerealiseerde winstgroei (${num(d.trailingPeg, lang)}) als op basis van de verwachte groei (${num(d.forwardPeg, lang)}) onder de grens van ${num(threshold, lang, 1)}.`
        : `The PEG ratio is below the ${num(threshold, lang, 1)} ceiling on both bases: ${num(d.trailingPeg, lang)} on realised earnings growth and ${num(d.forwardPeg, lang)} on expected growth.` });
  } else if (d.basis === 'forward') {
    out.push({ section: 'passes', text:
      lang === 'nl'
        ? `Dit komt door de verwachte PEG (${num(d.forwardPeg, lang)}, op basis van een consensusverwachting van ${pct(d.forwardGrowth, lang, 0)} winstgroei dit jaar) en niet door de gerealiseerde PEG (${num(d.trailingPeg, lang)}) — die groei is nog niet zichtbaar in de gerapporteerde cijfers.`
        : `This passes on forward PEG (${num(d.forwardPeg, lang)}, based on consensus of ${pct(d.forwardGrowth, lang, 0)} EPS growth this year) rather than trailing PEG (${num(d.trailingPeg, lang)}) — the growth hasn't shown up in reported results yet.` });
    out.push({ section: 'check', text:
      lang === 'nl'
        ? `Loop het blok "Mijn kwalitatieve beoordeling" hieronder langs voordat je dit als een bevestigd instapmoment behandelt: heeft het management de langetermijndoelen herbevestigd, en gaat het om een tijdelijk vraag- of aanbodprobleem dat het boek zou herkennen?`
        : `Work through the "My qualitative review" block below before treating this as a confirmed entry: has management reaffirmed its long-term targets, and is this a temporary demand- or supply-side issue of the kind the book recognises?` });
  } else if (d.basis === 'trailing') {
    out.push({ section: 'passes', text:
      lang === 'nl'
        ? `De PEG-ratio is ${num(d.trailingPeg, lang)}, onder de grens van ${num(threshold, lang, 1)} (winst per aandeel groeide gemiddeld ${pct(d.epsCagr, lang, 0)} per jaar over vijf jaar).`
        : `The PEG ratio is ${num(d.trailingPeg, lang)}, under the ${num(threshold, lang, 1)} ceiling (EPS growth has averaged ${pct(d.epsCagr, lang, 0)}/year over 5 years).` });
    if (d.outlookDeteriorating) {
      out.push({ section: 'check', text:
        lang === 'nl'
          ? `Let op de andere kant: de verwachte PEG (${num(d.forwardPeg, lang)}) ligt juist bóven de grens, dus analisten verwachten dat de groei afzwakt. Het gerealiseerde cijfer ziet er beter uit dan het vooruitzicht.`
          : `Note the other direction: the forward PEG (${num(d.forwardPeg, lang)}) is above the ceiling, so consensus expects growth to slow. The trailing figure looks better than the outlook does.` });
    }
  } else {
    out.push({ section: 'missing', text:
      lang === 'nl'
        ? `De PEG-ratio is ${num(d.trailingPeg, lang)} en blijft daarmee boven de grens van ${num(threshold, lang, 1)}${d.forwardPeg != null ? `; ook de verwachte PEG (${num(d.forwardPeg, lang)}) haalt die grens niet` : ''}.`
        : `The PEG ratio is ${num(d.trailingPeg, lang)}, above the ${num(threshold, lang, 1)} ceiling${d.forwardPeg != null ? `, and the forward PEG (${num(d.forwardPeg, lang)}) does not clear it either` : ''}.` });
  }

  return out;
}

function buildOne(input: ExplainInput, lang: Lang): WhyPart[] {
  const { symbol, name, signal, ratios } = input;
  const label = name ?? symbol;
  const by = (key: string) => signal.conditions.find((c) => c.key === key);

  const drawdown = ratios.drawdown_5y;
  const dd = drawdown.detail as { high?: number | null; recoveryNeeded?: number | null };
  const roa = ratios.roa;
  const roaDetail = roa.detail as { isAdjusted?: boolean; rawValue?: number | null; isApproximation?: boolean };
  const parts: WhyPart[] = [];

  // --- opening --------------------------------------------------------------
  if (signal.status === 'buy_worthy') {
    parts.push({ section: 'verdict', text:
      lang === 'nl'
        ? `${symbol} is vandaag koopwaardig geworden.`
        : `${symbol} turned buy-worthy today.` });
  } else if (signal.status === 'almost') {
    parts.push({ section: 'verdict', text:
      lang === 'nl'
        ? `${symbol} voldoet aan ${signal.conditionsMet} van de ${signal.conditionsApplicable} voorwaarden die op dit bedrijf van toepassing zijn.`
        : `${symbol} meets ${signal.conditionsMet} of the ${signal.conditionsApplicable} conditions that apply to this company.` });
  } else {
    parts.push({ section: 'verdict', text:
      lang === 'nl'
        ? `${label} staat op de volglijst en voldoet aan ${signal.conditionsMet} van de ${signal.conditionsApplicable} van toepassing zijnde voorwaarden.`
        : `${label} is on the watchlist, meeting ${signal.conditionsMet} of the ${signal.conditionsApplicable} applicable conditions.` });
  }

  // --- size and sector leadership ------------------------------------------
  const marketCap = by('market_cap');
  if (marketCap?.passed) {
    const rank = input.industryRank;
    parts.push({ section: 'passes', text:
      lang === 'nl'
        ? `Het is een groot bedrijf (beurswaarde ${billions(marketCap.value, lang)})${rank ? `, nummer ${rank.rank} in ${rank.industry}` : ''}.`
        : `It is a large company (market cap ${billions(marketCap.value, lang)})${rank ? `, ranked #${rank.rank} in ${rank.industry}` : ''}.` });
  }

  // --- the drawdown, the book's core signal --------------------------------
  if (drawdown.value != null) {
    const decline = -drawdown.value;
    const base =
      lang === 'nl'
        ? `De koers staat ${pct(decline, lang)} onder de hoogste slotkoers van de afgelopen vijf jaar (${num(dd.high, lang)})`
        : `It trades ${pct(decline, lang)} below its 5-year high of ${num(dd.high, lang)}`;

    const waterfall =
      dd.recoveryNeeded != null
        ? lang === 'nl'
          ? ` — de logaritmische waterval betekent dat er ${pct(dd.recoveryNeeded, lang)} koerswinst nodig is om dat niveau terug te halen`
          : ` — the logarithmic-waterfall maths means it needs a ${pct(dd.recoveryNeeded, lang)} gain to reclaim that level`
        : '';

    const conviction = by('drawdown')?.passed
      ? lang === 'nl'
        ? `, en het boek ziet dalingen van 50% of meer bij kwaliteitsbedrijven als zeldzame instapmomenten met hoge overtuiging.`
        : `, and the book flags declines of 50%+ in quality names as rare, high-conviction entry points.`
      : '.';

    parts.push({
      section: by('drawdown')?.passed ? 'passes' : 'missing',
      text: `${base}${waterfall}${conviction}`,
    });
  }

  // --- PEG ------------------------------------------------------------------
  const peg = by('peg');
  if (peg) parts.push(...pegSentences(peg, lang));

  // --- returns --------------------------------------------------------------
  const returns = by('returns');
  if (returns) {
    const d = returns.detail as { roe?: number | null; roa?: number | null };
    const roeHistory = ratios.roe.detail as { qualifyingYears?: number; yearsAvailable?: number };

    let sentence =
      lang === 'nl'
        ? `Het rendement op eigen vermogen lag in ${roeHistory.qualifyingYears ?? 0} van de ${roeHistory.yearsAvailable ?? 0} jaar boven 15% (nu ${pct(d.roe, lang)}) en het rendement op activa is ${pct(d.roa, lang)}`
        : `ROE has stayed above 15% in ${roeHistory.qualifyingYears ?? 0} of the last ${roeHistory.yearsAvailable ?? 0} years (currently ${pct(d.roe, lang)}) and ROA is ${pct(d.roa, lang)}`;

    // Say plainly when the ROA has been adjusted, and why.
    if (roaDetail.isAdjusted) {
      sentence +=
        lang === 'nl'
          ? ` (gecorrigeerd voor settlementsaldi; het ruwe cijfer van ${pct(roaDetail.rawValue, lang)} wordt vertekend door geld dat voor klanten wordt aangehouden${roaDetail.isApproximation ? ', en de correctie is een benadering' : ''})`
          : ` (adjusted for settlement balances; the raw figure of ${pct(roaDetail.rawValue, lang)} is distorted by funds held on behalf of customers${roaDetail.isApproximation ? ', and the adjustment is an approximation' : ''})`;
    }
    parts.push({ section: 'passes', text: `${sentence}.` });
  }

  // --- cash flow and debt ---------------------------------------------------
  const cashFlow = by('cash_flow');
  if (cashFlow?.applicable && cashFlow.value != null) {
    parts.push({ section: 'passes', text:
      lang === 'nl'
        ? `De vrije kasstroom is positief en de operationele kasstroom dekt ${pct(cashFlow.value, lang)} van de nettowinst — een teken van zuivere boekhouding.`
        : `Free cash flow is positive and operating cash flow covers ${pct(cashFlow.value, lang)} of net income — a sign of clean accounting.` });
  }

  const debt = by('debt');
  if (debt?.applicable && debt.passed) {
    const netCash = (debt.detail as { netCash?: boolean }).netCash;
    parts.push({ section: 'passes', text:
      netCash
        ? lang === 'nl'
          ? `Het bedrijf heeft meer kas dan schuld.`
          : `The company holds more cash than debt.`
        : lang === 'nl'
          ? `De schuld is laag (nettoschuld/EBITDA ${num(debt.value, lang, 1)}).`
          : `Debt is low (net debt/EBITDA ${num(debt.value, lang, 1)}).` });
  }

  // --- what is missing ------------------------------------------------------
  if (signal.status !== 'buy_worthy' && signal.missing.length > 0) {
    const named = signal.missing
      .map((key) => CONDITION_LABEL[key]?.[lang] ?? key)
      .join(lang === 'nl' ? ', ' : ', ');
    parts.push({ section: 'missing', text:
      lang === 'nl' ? `Nog niet in orde: ${named}.` : `Still missing: ${named}.` });

    // Say by how much, for the conditions where a number makes it concrete.
    for (const key of signal.missing) {
      const condition = by(key);
      if (!condition || condition.value == null) continue;
      if (key === 'drawdown') {
        // Build the target from the threshold rather than reusing
        // condition.target, which is an English-only string.
        const required = (condition.detail as { green?: number }).green ?? 0.5;
        parts.push({ section: 'missing', text:
          lang === 'nl'
            ? `De koers staat ${pct(-condition.value, lang)} onder de top, nog niet de ${pct(required, lang)} die het boek vraagt.`
            : `The decline is ${pct(-condition.value, lang)}, short of the ${pct(required, lang)} the book asks for.` });
      }
      if (key === 'pe') {
        parts.push({ section: 'missing', text:
          lang === 'nl'
            ? `De koers-winstverhouding is ${num(condition.value, lang)}, boven het plafond van 30.`
            : `The P/E is ${num(condition.value, lang)}, above the ceiling of 30.` });
      }
    }
  }

  // --- the handover to the human -------------------------------------------
  if (signal.status === 'buy_worthy') {
    parts.push({ section: 'check', text:
      lang === 'nl'
        ? `Eén ding moet je zelf beoordelen: het boek vraagt als volgende stap of het probleem tijdelijk of structureel is — zie het blok "Mijn kwalitatieve beoordeling" hieronder.`
        : `One thing to check yourself: the book's own next step is judging whether the problem is temporary or structural — see the qualitative review section below.` });
  }

  return parts;
}

/**
 * Generates the explanation in both languages. Never one without the other.
 *
 * The joined prose is what the email and the suggestion cards have always
 * shown, and joining the parts in order reproduces it exactly — the structure
 * is additional information, not a rewrite.
 */
export function explainSignal(input: ExplainInput): Explanation {
  return {
    en: buildOne(input, 'en').map((p) => p.text).join(' '),
    nl: buildOne(input, 'nl').map((p) => p.text).join(' '),
  };
}

/** The same sentences, still tagged with the part of the answer they belong to. */
export function explainSections(input: ExplainInput): Record<Lang, WhyPart[]> {
  return { en: buildOne(input, 'en'), nl: buildOne(input, 'nl') };
}

/**
 * Subject and body for the notification email, reusing the same generator so
 * the email and the detail page can never say different things.
 */
export function explainForEmail(
  input: ExplainInput,
  lang: Lang,
): { subject: string; body: string } {
  const explanation = explainSignal(input);
  const label = input.name ?? input.symbol;

  return {
    subject:
      lang === 'nl'
        ? `${input.symbol} is koopwaardig geworden`
        : `${input.symbol} is now buy-worthy`,
    body: `${label} (${input.symbol})\n\n${explanation[lang]}`,
  };
}
