import type { StatementTable as Table } from '@/lib/data/statementTable';
import { ScrollableTable } from './ScrollableTable';

/**
 * A financial statement, at the density a financial statement needs.
 *
 * This is the one place in the app where dense is correct. The default stock
 * page is deliberately sparse and stays that way; a reader who has clicked
 * through to "Full research" has asked for the numbers, and giving them four
 * at a time in generous cards would be a worse answer than a table.
 *
 * Growth rows sit under their parent rather than behind a disclosure. The
 * brief asked for expandable groups, and with one growth row per parent and
 * at most six of them per statement, a `<details>` per row would be six
 * clicks to reveal six lines — the interaction would cost more than it
 * saved. The rows are indented and muted instead, which reads as
 * subordinate without hiding anything.
 */
export function StatementTable({
  table,
  labels,
  formatValue,
  formatPercent,
  formatColumn,
}: {
  table: Table;
  labels: { growthRow: string };
  formatValue: (value: number, format: string) => string;
  formatPercent: (value: number) => string;
  formatColumn: (endDate: string) => string;
}) {
  return (
    <ScrollableTable>
      <table className="w-full min-w-[42rem] text-sm">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="sticky left-0 bg-surface py-2 pr-4 text-left text-xs font-medium text-ink-subtle">
              {' '}
            </th>
            {table.columns.map((column) => (
              <th
                key={column}
                scope="col"
                className="py-2 pl-4 text-right text-xs font-medium text-ink-subtle"
              >
                {formatColumn(column)}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-line">
          {table.rows.map((row) => (
            <>
              <tr key={row.key} className={row.emphasis ? 'bg-surface-sunken/40' : undefined}>
                <th
                  scope="row"
                  className={[
                    'sticky left-0 py-1.5 pr-4 text-left font-normal',
                    row.emphasis ? 'bg-surface-sunken/40 font-medium text-ink' : 'text-ink-muted',
                    row.indent ? 'pl-3' : '',
                  ].join(' ')}
                >
                  {row.label}
                </th>
                {row.values.map((value, i) => (
                  <td
                    key={`${row.key}-${i}`}
                    className={[
                      'py-1.5 pl-4 text-right tabular-nums',
                      row.emphasis ? 'font-medium text-ink' : 'text-ink-muted',
                    ].join(' ')}
                  >
                    {value == null ? <span className="text-ink-faint">—</span> : formatValue(value, row.format)}
                  </td>
                ))}
              </tr>

              {row.growth && (
                <tr key={`${row.key}-growth`} className="border-t-0">
                  <th
                    scope="row"
                    className="sticky left-0 bg-surface py-1 pl-3 pr-4 text-left text-xs font-normal text-ink-faint"
                  >
                    {labels.growthRow}
                  </th>
                  {row.growth.map((value, i) => (
                    <td
                      key={`${row.key}-g-${i}`}
                      className={[
                        'py-1 pl-4 text-right text-xs tabular-nums',
                        // Muted, per the design notes: a column of
                        // full-saturation reds and greens reads as an alarm.
                        value == null ? 'text-ink-faint' : value >= 0 ? 'text-pass' : 'text-fail',
                      ].join(' ')}
                    >
                      {value == null ? '' : formatPercent(value)}
                    </td>
                  ))}
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </ScrollableTable>
  );
}
