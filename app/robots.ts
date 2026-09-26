import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

/**
 * Crawler rules for the public front door (safety item 1).
 *
 * The landing and demo pages are the only routes a crawler can reach — the rest
 * of the app redirects to /login. Until PUBLIC_INDEXING is set, they are the very
 * pages we do not want indexed: the demos show finance-query data whose
 * public-display licence is not settled. So the default is to disallow everything;
 * flipping the flag opens the public routes and keeps /api out.
 */
export default function robots(): MetadataRoute.Robots {
  if (!env.publicIndexing()) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }
  return { rules: [{ userAgent: '*', allow: '/', disallow: '/api/' }] };
}
