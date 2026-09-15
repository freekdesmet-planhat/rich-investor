import { ImageResponse } from 'next/og';

/**
 * The home-screen icon on iOS, which is the case that matters here: this is an
 * app you check on the sofa, and Safari ignores the manifest's icons for the
 * home screen in favour of this one.
 *
 * 180×180 is the size Apple asks for, and the artwork is deliberately flat and
 * edge-to-edge because iOS masks it into a rounded square itself.
 */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          color: '#fff',
          fontSize: 120,
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
