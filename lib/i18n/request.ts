/**
 * next-intl server configuration.
 *
 * Used without i18n routing: the locale comes from the user's preference rather
 * than a URL segment, so there are no /en and /nl paths to keep in sync.
 */
import { getRequestConfig } from 'next-intl/server';
import { resolveLocale } from './config';

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    messages: (await import(`@/messages/${locale}.json`)).default,
  };
});
