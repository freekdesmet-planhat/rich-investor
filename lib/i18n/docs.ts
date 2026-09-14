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

/**
 * Every way the two markdown files word the source annotation.
 *
 * Both spellings of the app default are here on purpose: the docs write it out
 * as "standaardinstelling van de app" while `messages/nl.json` shortens the
 * label to "standaardinstelling", and a card that matched only the short one
 * left the long one in the prose beside it.
 */
const SOURCE_ANNOTATIONS = [
  'from the book',
  'app default',
  'uit het boek',
  'standaardinstelling van de app',
  'standaardinstelling',
] as const;

/**
 * Removes the source annotation a doc target ends with.
 *
 * The markdown states the source in prose so each file reads correctly on its
 * own, and every ratio row also carries it as data (`target_source`). A card
 * rendering both printed it twice, so the renderer drops the prose copy and
 * keeps the data-driven one, which stays right if a threshold's source changes.
 *
 * Only the known annotations are removed, never any trailing parenthetical: a
 * target may legitimately end in one that qualifies the number rather than
 * naming its source — "≤ 20 (R&D-adjusted)" — and stripping that would delete
 * the part that says which figure is being judged.
 *
 * The `translations` table is seeded from this same markdown, so this also runs
 * on values read back from the database.
 */
export function stripSourceSuffix(target: string): string {
  const trimmed = target.trimEnd();
  if (!trimmed.endsWith(')')) return target;

  const open = trimmed.lastIndexOf('(');
  if (open <= 0) return target;

  const inside = trimmed.slice(open + 1, -1).trim().toLowerCase();
  if (!SOURCE_ANNOTATIONS.some((annotation) => annotation === inside)) return target;

  const stripped = trimmed.slice(0, open).trimEnd();
  // A target that is nothing but an annotation is left as it is, rather than
  // rendered as an empty target.
  return stripped.length > 0 ? stripped : target;
}

/**
 * Rejoins prose that was hard-wrapped in the markdown source.
 *
 * Both files wrap at about 85 columns so they read well in an editor and diff
 * cleanly. The card renders the explanation with `whitespace-pre-line`, which
 * honours those newlines, so a paragraph written for an 85-column editor came
 * out as a column of short ragged lines at whatever width the reader's screen
 * happened to be — every one of the 52 entries in each language.
 *
 * Blank lines are real paragraph breaks and survive; a line break inside a
 * paragraph becomes a space, and the browser wraps to the space available. List
 * items keep their own lines, since a wrapped bullet is not a paragraph.
 */
export function unwrapParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => {
      const lines = paragraph.split('\n');
      const isList = lines.some((line) => /^\s*([-*+]|\d+[.)])\s/.test(line));
      if (isList) return lines.join('\n');
      return lines.map((line) => line.trim()).filter(Boolean).join(' ');
    })
    .join('\n\n')
    .trim();
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
