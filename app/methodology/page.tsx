import { redirect } from 'next/navigation';

// Runtime redirect (not prerendered), so old links and the #four-sectors anchor
// always land on the merged How it works page (round 2, item 4).
export const dynamic = 'force-dynamic';

export default function MethodologyPage() {
  redirect('/how-it-works#four-sectors');
}
