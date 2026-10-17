// The pilot's two hooks into the owner's dashboard (pilot.mjs, docs/monetization/pilot.md), kept apart from pilot.mjs so business.mjs
// can use them without the two modules importing each other.
import { imp } from '../../scripts/lib-loader.mjs';

const { weekStartOf } = await imp('market/weeks.js');

// An owner loaded their dashboard or changed a profile: that week counts as one they came back in. One row per profile per week.
export function markOwnerActive(db, businessIds, at = Date.now()) {
  const week = weekStartOf(at);
  const ins = db.prepare('INSERT OR IGNORE INTO owner_activity (business_id, week, first_at) VALUES (?, ?, ?)');
  for (const id of businessIds) ins.run(id, week, at);
}

export const feedbackView = (f) => ({ week: f.week, rating: f.rating, result: f.result, missing: f.missing, wouldPay: f.would_pay, at: f.created_at });

// For the owner's dashboard: null unless the profile is in the pilot; then since when, this week, and this week's answers if sent.
export function memberStatus(db, businessId, at = Date.now()) {
  const m = db.prepare('SELECT joined_at FROM pilot_members WHERE business_id = ? AND left_at IS NULL').get(businessId);
  if (!m) return null;
  const week = weekStartOf(at);
  const f = db.prepare('SELECT * FROM pilot_feedback WHERE business_id = ? AND week = ?').get(businessId, week);
  return { since: m.joined_at, week, feedback: f ? feedbackView(f) : null };
}
