// The words of the consents a player gives, in one place: the account settings show them, the privacy policy quotes them and
// tests/legal.test.mjs checks both use these. No imports, so a browser component can use it without pulling in anything else.
export const NEWSLETTER_CONSENT = {
  // the Plot of the Day newsletter (services/api/engage.mjs sendNewsletter): opt-in, off until ticked, apart from the service notices
  label: 'Email me the Plot of the Day newsletter',
  detail: 'A pick of the city\'s businesses and the busiest ones this week. Separate from the notices about your own plots, leases, stalls and requests. Each issue has an unsubscribe link: open it and press Confirm, no sign-in needed (your mail app\'s own Unsubscribe button works in one click).',
};
export const NOTICES_CONSENT = {
  // service notices (transactional): take-overs, lease and watched-plot reminders, stall bookings, requests to your business
  label: 'Send me notices about my plots, leases, stalls and requests',
};
