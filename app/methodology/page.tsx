import { redirect } from 'next/navigation';

/**
 * Merged into How it works (round 2, item 4). Kept as a permanent redirect so old
 * links and the #four-sectors anchor still land on the right place.
 */
export default function MethodologyPage() {
  redirect('/how-it-works#four-sectors');
}
