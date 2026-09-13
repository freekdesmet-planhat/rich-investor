'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { generateThesis, type ThesisContext } from '@/lib/ai/thesis';

export interface ThesisState {
  status: 'idle' | 'done' | 'error';
  message?: string;
}

interface SignalRow {
  as_of: string;
  status: string;
  lynch_category: string;
  focus_sector: string;
  conditions_met: number;
  conditions_applicable: number;
  peg_basis: string | null;
  checklist: Array<{ key: string; applicable: boolean; passed: boolean; target: string }>;
}

interface RatioRow {
  ratio_key: string;
  value: number | null;
  detail: Record<string, unknown>;
}

/**
 * Generates or refreshes the thesis for one ticker.
 *
 * Only ever runs on a click — never in the nightly job — so the cost is one
 * call per request rather than one per ticker per day. Everything it sends is a
 * figure the ratio engine already computed, so the summary and the cards on the
 * page describe the same numbers.
 */
export async function generateThesisAction(
  _prev: ThesisState,
  formData: FormData,
): Promise<ThesisState> {
  const symbol = String(formData.get('symbol') ?? '');
  if (!symbol) return { status: 'error', message: 'missing_symbol' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 'error', message: 'not_signed_in' };

  const { data: signal } = await supabase
    .from('signal_history')
    .select(
      'as_of,status,lynch_category,focus_sector,conditions_met,conditions_applicable,peg_basis,checklist',
    )
    .eq('symbol', symbol)
    .order('as_of', { ascending: false })
    .limit(1)
    .maybeSingle<SignalRow>();

  if (!signal) return { status: 'error', message: 'no_signal' };

  const { data: ratios } = await supabase
    .from('ratios')
    .select('ratio_key,value,detail')
    .eq('symbol', symbol)
    .eq('as_of', signal.as_of)
    .returns<RatioRow[]>();

  const byKey = new Map((ratios ?? []).map((row) => [row.ratio_key, row]));
  const peg = byKey.get('peg');
  const roa = byKey.get('roa');

  const { data: universe } = await supabase
    .from('universe')
    .select('name')
    .eq('symbol', symbol)
    .maybeSingle<{ name: string | null }>();

  const context: ThesisContext = {
    symbol,
    name: universe?.name ?? null,
    focusSector: signal.focus_sector,
    lynchCategory: signal.lynch_category,
    status: signal.status,
    conditionsMet: signal.conditions_met,
    conditionsApplicable: signal.conditions_applicable,
    checklist: signal.checklist ?? [],
    peg: peg?.value ?? null,
    forwardPeg: (peg?.detail?.forwardPeg as number | null) ?? null,
    pegBasis: signal.peg_basis,
    roe: byKey.get('roe')?.value ?? null,
    roa: roa?.value ?? null,
    roaIsAdjusted: Boolean(roa?.detail?.isAdjusted),
    epsGrowth: byKey.get('eps_growth')?.value ?? null,
    debt: byKey.get('debt')?.value ?? null,
    earningsQuality: byKey.get('earnings_quality')?.value ?? null,
    drawdown: byKey.get('drawdown_5y')?.value ?? null,
  };

  try {
    const result = await generateThesis(context);

    const { error } = await supabase.from('ticker_summaries').upsert(
      {
        symbol,
        thesis_en: result.en,
        thesis_nl: result.nl,
        model: result.model,
        is_mock: result.isMock,
        signal_as_of: signal.as_of,
        generated_by: user.id,
        generated_at: new Date().toISOString(),
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
      },
      { onConflict: 'symbol' },
    );
    if (error) return { status: 'error', message: error.message };

    revalidatePath(`/stock/${symbol}`);
    return { status: 'done' };
  } catch (error) {
    return { status: 'error', message: (error as Error).message };
  }
}
