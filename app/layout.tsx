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
 * The warm dark canvas (round 2, item 7), so a phone's status bar matches the
 * app rather than flashing a cool navy that appears nowhere in the design.
 */
export const viewport: Viewport = {
  themeColor: '#131210',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const t = await getTranslations('app');

  // The theme is set server-side from the cookie so there is no flash. With no
  // saved preference the attribute is left off ("system"), so the CSS media query
  // follows the OS at first paint (round 2, item 7 review). The inline script
  // below then lets localStorage win on the client, where a logged-out choice lives.
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
        {/* Theme-variant canary (round 2, item 7 fix). `dark:` is bound to the
            `data-theme` attribute, not the OS media query, so a forced-light app
            must stay light even when the OS is in dark mode. This hidden probe is
            the one place a `dark:` utility is guaranteed to exist for the Playwright
            theme check (verify:theme) to read: white in light, black in dark — if
            the binding ever regresses to the OS query, its colour stops following
            the toggle and the check fails. sr-only + aria-hidden: never seen. */}
        <span data-theme-probe aria-hidden="true" className="sr-only bg-white dark:bg-black" />

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
            <p className="mt-1 text-ink-subtle">{t('tagline')}</p>
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
