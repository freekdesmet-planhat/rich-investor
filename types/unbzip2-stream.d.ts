/**
 * unbzip2-stream ships no types. It is used only by scripts/import-universe.ts
 * to decompress the FinanceDatabase archive, so a minimal declaration is enough.
 */
declare module 'unbzip2-stream' {
  import type { Transform } from 'node:stream';
  export default function unbzip2Stream(): Transform;
}
