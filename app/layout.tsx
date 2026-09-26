import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import { ClientErrorReporter } from '@/components/ClientErrorReporter';
import { THEME_COOKIE, DEFAULT_THEME, dataTheme, isTheme, THEME_STORAGE_KEY } from '@/lib/theme';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return {
    title: t('name'),
    description: t('tagline'),
    // Installed on iOS this opens without browser chrome, like the manifest's
    // `standalone` does elsewhere; Safari reads its own meta rather than the
    // manifest for that.
    appleWebApp: { capable: true, title: t('name'), statusBarStyle: 'default' },
  };
}

/**
 * The colour the browser paints around the app once installed.
 *
 * slate-900 is the app's own ink, so a phone's status bar does not flash a
 * colour that appears nowhere in the design.
 */
export const viewport: Viewport = {
  themeColor: '#0f172a',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const t = await getTranslations('app');

  // The theme is set server-side from the cookie so there is no flash; new users
  // default to light (item 3). The inline script below then lets localStorage win
  // on the client, which is where a logged-out preference lives.
  const cookieTheme = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = isTheme(cookieTheme) ? cookieTheme : DEFAULT_THEME;

  return (
    <html
      lang={locale}
      data-theme={dataTheme(theme)}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-canvas text-ink">
        {/* Applies a logged-out localStorage preference before paint, so the theme
            follows the reader on the public pages too (item 3). Cookie and storage
            are written together, so this is a no-op on the common path. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');var d=document.documentElement;if(t==='light'||t==='dark'){d.setAttribute('data-theme',t)}else if(t==='system'){d.removeAttribute('data-theme')}}catch(e){}`,
          }}
        />
        {/* Outside the provider and above every page, so it is listening
            before anything that might fail has rendered. */}
        <ClientErrorReporter />

        <NextIntlClientProvider>
          <div className="flex-1">{children}</div>

          {/* Required on every page, in the active language (section 2).
              The tagline moved here out of the sticky header, where it cost
              two lines of vertical space on every page: the credit it carries
              is worth keeping and a footer is where a credit belongs. Item 4
              replaces it with a proper methodology page. */}
          <footer className="mt-12 border-t border-line px-4 py-6 text-center text-xs text-ink-subtle">
            <p>{t('disclaimer')}</p>
            <p className="mt-1 text-ink-faint">{t('tagline')}</p>
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
