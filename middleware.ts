import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static assets, images, and the files a browser fetches
    // before anyone has signed in.
    //
    // The manifest and the generated icons are the second group: they carry no
    // file extension, so the image rule below does not cover them, and gating
    // them redirected the browser to /login while it was deciding whether the
    // app could be installed. The result was no install prompt and a broken
    // home-screen icon — and nothing in the app looked wrong.
    '/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest|icon$|apple-icon$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
