/**
 * Session refresh and route protection.
 *
 * Runs on every request: refreshes the Supabase session cookie, and redirects
 * anyone without a session to the sign-in page. Reference data is behind RLS
 * too, so an unauthenticated request would render an empty app rather than a
 * broken one — but sending them to sign in is the honest response.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { safeReturnTo } from '@/lib/auth/returnTo';
import { isDefinitelySignedOut } from '@/lib/auth/sessionVerdict';

// The public front door (launch item 11): the landing page at "/", the read-only
// demo stock pages, and the privacy notice. "/" is matched exactly — every path
// starts with it — while the others are prefixes. The landing page itself renders
// nothing signed-in-only; the watchlist under "/" is gated inside the page by the
// user check, not here.
const PUBLIC_PATHS = ['/login', '/auth/callback', '/auth/error', '/demo', '/privacy'];

/**
 * Reads a public Supabase variable, naming it if it is missing.
 *
 * NEXT_PUBLIC_* values are inlined into the bundle at build time, so a
 * deployment whose build ran before these were configured carries `undefined`
 * here no matter what the runtime environment holds. Passing that straight to
 * createServerClient produces "Your project's URL and Key are required to
 * create a Supabase client!" on every single request, which names neither the
 * variable nor the fact that a rebuild is what fixes it.
 */
function requirePublicEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Public variables are inlined at build time, so set ` +
        `it in the build environment and redeploy — setting it only at runtime ` +
        `will not change an existing build.`,
    );
  }
  return value;
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    requirePublicEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requirePublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    },
  );

  // Must be getUser(), not getSession(): getUser() revalidates the token with
  // Supabase, while getSession() trusts whatever is in the cookie.
  const { data, error } = await supabase.auth.getUser();
  const user = data.user;

  // Revalidating means a round trip, and a round trip can fail for reasons that
  // have nothing to do with who is signed in. Treating every failure as
  // "signed out" is what made a stock page throw itself back to the watchlist
  // roughly once in thirty loads: a blip during token rotation redirected to
  // /login, by which point the cookie was good again, and /login sent the
  // now-recognised user to the home page.
  //
  // Only an answer *from* the auth server counts as a verdict. A transport
  // failure leaves the request alone: the database is the real boundary — every
  // table is behind RLS and is_allowed_user() — so the worst case is a page
  // with nothing in it, which beats being ejected from the page you were on.
  const unverifiable = Boolean(error && !isDefinitelySignedOut(error));

  const { pathname } = request.nextUrl;
  const isPublic = pathname === '/' || PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // API routes answer for themselves. Redirecting a fetch() to the sign-in HTML
  // gives the caller a 307 and a login page where it expected JSON; each route
  // under /api checks its own caller — a session for /api/thesis, a shared
  // secret for the nightly job — and replies with a status a client can read.
  if (!user && pathname.startsWith('/api/')) return response;

  if (!user && unverifiable) return response;

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    // Honour where they were headed. This used to discard the querystring and
    // send everyone to the watchlist, which is the other half of the bounce:
    // the path the middleware had just recorded was thrown away one redirect
    // later.
    const target = safeReturnTo(request.nextUrl.searchParams.get('next'));
    url.search = '';
    url.pathname = target.split('?')[0];
    const query = target.split('?')[1];
    if (query) url.search = `?${query}`;
    return NextResponse.redirect(url);
  }

  return response;
}
