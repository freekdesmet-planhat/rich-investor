import { ImageResponse } from 'next/og';

/**
 * The app's icon, drawn rather than shipped as a binary.
 *
 * `ImageResponse` renders it at build time from the same palette the app uses,
 * which keeps a PNG out of the repository and means the icon cannot drift from
 * the design by being forgotten in `public/`.
 *
 * "R" for Rijke Belegger — the book the whole framework comes from.
 */
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // slate-900, the app's own ink.
          background: '#0f172a',
          color: '#fff',
          fontSize: 340,
          fontWeight: 600,
          letterSpacing: '-0.05em',
        }}
      >
        R
      </div>
    ),
    { ...size },
  );
}
