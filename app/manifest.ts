import type { MetadataRoute } from 'next';
import { getTranslations } from 'next-intl/server';

/**
 * What the browser needs to install this as an app.
 *
 * It is a thing you check on the sofa, and it lived in a browser tab with a
 * default favicon — so it was never on a home screen, and being on a home
 * screen is most of what decides whether a check-it-occasionally app gets
 * checked. `display: standalone` opens it without the address bar, which also
 * removes the accidental "reload into the wrong page" a tab invites.
 *
 * Named through next-intl like everything else, so the icon on a Dutch phone
 * says Rijke Belegger. That makes this a request-time route rather than a
 * cached one, which is the right trade for a file fetched once per install.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getTranslations('app');

  return {
    name: t('name'),
    short_name: t('name'),
    description: t('tagline'),
    start_url: '/',
    display: 'standalone',
    // The watchlist is the page worth landing on, and it is the root.
    background_color: '#ffffff',
    // slate-900: matches the app's own ink, so the status bar does not flash a
    // colour that appears nowhere in the design.
    theme_color: '#0f172a',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
