// The constrained pilot (phase 6, docs/roadmap/world_freeze.md "When it lifts"): what counts for each business, and whether the pilot met
// the criteria that lift the world-expansion freeze. Pure, shared by the API (server/api/pilot.mjs), the admin page and the tests.

export const PILOT_WEEKS = 4; // the review's pilot: four weeks
export const RETURN_SHARE_OF_WEEKS = 0.75; // "returns weekly": the owner was back in at least 3 of every 4 completed weeks

// The criteria, in the order docs/roadmap/world_freeze.md lists them. share: of the businesses in the pilot; count: businesses.
export const PILOT_CRITERIA = [
  { id: 'returning', label: 'Businesses that return weekly', kind: 'share', target: 0.3, hint: 'The owner opened their dashboard (or changed their profile) in at least 3 of every 4 completed weeks.' },
  { id: 'interaction', label: 'Businesses with a meaningful call-to-action interaction', kind: 'share', target: 0.2, hint: 'At least one verified press of the button, meeting or quote request, or confirmed newsletter sign-up.' },
  { id: 'paying', label: 'Businesses that pay', kind: 'count', target: 3, hint: 'A paid order (Launch Pack, Pro or a placement) during the pilot.' },
  { id: 'renewing', label: 'Businesses that renew or ask for another campaign', kind: 'count', target: 2, hint: 'Pro renewed, a second paid order, or interest in another plan after paying.' },
  { id: 'verifiedOnly', label: 'No simulated advertiser figures', kind: 'flag', target: true, hint: 'With a server, owners only ever see verified figures (docs/architecture/authoritative_data.md).' },
];

// Whether an owner kept coming back: active in at least 75% of the completed weeks they were in the pilot (none completed yet: not yet).
export const returnedWeekly = (activeWeeks, completedWeeks) => completedWeeks > 0 && activeWeeks >= Math.ceil(completedWeeks * RETURN_SHARE_OF_WEEKS);

// A business's weekly figures add up to a meaningful interaction when anyone verifiably acted on its call to action.
export const hadInteraction = (totals) => (totals?.ctaClicks ?? 0) + (totals?.leads ?? 0) > 0;

// The verdict for a pilot: each criterion with its actual value and whether it is met, and whether all are (the freeze can lift).
// `businesses` are [{ returnedWeekly, interaction, paid, renewed }]; `simulatedShown` is true if any owner saw simulated figures.
export function pilotVerdict(businesses = [], { simulatedShown = false } = {}) {
  const n = businesses.length;
  const count = (key) => businesses.filter((b) => b[key]).length;
  const actual = {
    returning: n ? count('returnedWeekly') / n : 0,
    interaction: n ? count('interaction') / n : 0,
    paying: count('paid'),
    renewing: count('renewed'),
    verifiedOnly: !simulatedShown,
  };
  const criteria = PILOT_CRITERIA.map((c) => {
    const value = actual[c.id];
    const met = c.kind === 'flag' ? value === c.target : n > 0 && value >= c.target;
    return { ...c, actual: value, met, ...(c.kind === 'share' ? { of: n, businesses: count(c.id === 'returning' ? 'returnedWeekly' : 'interaction') } : {}) };
  });
  return { businesses: n, criteria, met: criteria.filter((c) => c.met).length, lifts: n > 0 && criteria.every((c) => c.met) };
}
