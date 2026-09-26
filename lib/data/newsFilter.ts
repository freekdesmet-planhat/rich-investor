/**
 * Whether a news headline is an analyst rating or price-target story.
 *
 * The research feed filled with "Analyst raises price target to $250" and
 * "Firm upgrades to Overweight" — a rating is someone else's recommendation, which
 * this app deliberately does not surface (audit 18). These are hidden; the company's
 * own news is kept. Matched on the headline, so the odd false positive only hides a
 * story about a rating, never a fundamental one.
 */
const RATING_HEADLINE =
  /\b(price target|target price|upgrade[ds]?|downgrade[ds]?|ratings?|overweight|underweight|outperform|underperform|buy rating|sell rating|hold rating|reiterat\w*|initiate[ds]?\s+coverage|analysts?\s+(raise|lower|cut|boost)|(raise[ds]?|lower[ds]?|cut[s]?|boost[ds]?)\s+(its\s+)?(price\s+)?target)\b/i;

export function isAnalystRatingHeadline(title: string | null | undefined): boolean {
  if (!title) return false;
  return RATING_HEADLINE.test(title);
}
