/**
 * Parses docs/ratios.<lang>.md into structured entries.
 *
 * Those two files are the single source of truth per language for every ratio
 * explanation, Lynch label and buy-worthy caveat (section 2). Tooltips read
 * from here, and the `translations` table is seeded from the same parse, so
 * documentation and UI copy can never drift apart.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type Lang = 'en' | 'nl';
export const LANGUAGES: Lang[] = ['en', 'nl'];

export interface DocEntry {
  /** e.g. 'ratio' | 'lynch' */
  namespace: string;
  /** e.g. 'pe', 'drawdown_5y', 'high_growth' */
  key: string;
  name: string;
  target: string;
  explanation: string;
}

const HEADING = /^##\s+([a-z_]+):([a-z0-9_]+)\s*$/i;
const NAME = /^\*\*(?:Naam|Name):\*\*\s*(.+)$/;
const TARGET = /^\*\*(?:Doel|Target):\*\*\s*(.+)$/;

/**
 * Splits the markdown into entries.
 *
 * Everything before the first `## namespace:key` heading is preamble that
 * documents the format, and is skipped.
 */
export function parseDocs(markdown: string): DocEntry[] {
  const entries: DocEntry[] = [];
  let current: DocEntry | null = null;
  let body: string[] = [];

  const flush = () => {
    if (!current) return;
    current.explanation = body.join('\n').trim();
    if (current.explanation.length > 0 || current.name.length > 0) entries.push(current);
    body = [];
  };

  for (const line of markdown.split('\n')) {
    const heading = HEADING.exec(line.trim());
    if (heading) {
      flush();
      current = {
        namespace: heading[1].toLowerCase(),
        key: heading[2],
        name: '',
        target: '',
        explanation: '',
      };
      continue;
    }
    if (!current) continue;

    const name = NAME.exec(line.trim());
    if (name) {
      current.name = name[1].trim();
      continue;
    }
    const target = TARGET.exec(line.trim());
    if (target) {
      current.target = target[1].trim();
      continue;
    }
    // A horizontal rule separates sections, never part of an explanation.
    if (line.trim() === '---') continue;
    body.push(line);
  }
  flush();

  return entries;
}

export function docsPath(lang: Lang): string {
  return path.join(process.cwd(), 'docs', `ratios.${lang}.md`);
}

export async function loadDocs(lang: Lang): Promise<DocEntry[]> {
  return parseDocs(await readFile(docsPath(lang), 'utf8'));
}

/** Keyed as `${namespace}:${key}` for direct lookup. */
export async function loadDocsMap(lang: Lang): Promise<Map<string, DocEntry>> {
  const entries = await loadDocs(lang);
  return new Map(entries.map((e) => [`${e.namespace}:${e.key}`, e]));
}
