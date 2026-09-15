import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { ClientErrorReporter } from '@/components/ClientErrorReporter';
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

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {/* Outside the provider and above every page, so it is listening
            before anything that might fail has rendered. */}
        <ClientErrorReporter />

        <NextIntlClientProvider>
          <div className="flex-1">{children}</div>

          {/* Required on every page, in the active language (section 2). */}
          <footer className="border-t border-slate-200 px-4 py-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            {t('disclaimer')}
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
