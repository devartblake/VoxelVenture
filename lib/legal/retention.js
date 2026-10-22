// How long things are kept, as the policies state it (lib/legal/facts.js re-exports this; tests/legal.test.mjs checks every number against
// the code). No imports, so a browser component can quote a period without pulling in anything else.
export const RETENTION = {
  sessionDays: 30, // services/api/core.mjs: a sign-in lasts 30 days
  inquiryDays: 180, // services/api/conversions.mjs INQUIRY_DAYS: then a request's contact details and message are wiped
  nearbyDays: 7, // services/api/messaging.mjs: nearby chat kept as evidence for reports, then wiped
  nearbyDeleteDays: 37, // ...and the row deleted 30 days after that, unless it was reported
  inboxDays: 90, // private messages: the text is wiped after this
  reportEvidenceDays: 180, // a reported message's copy, after the report is decided
  presenceDays: 1, // services/api/stats.mjs: who is online now
  referralDays: 30, // lib/business/referral.js: the referral code kept in the browser
  ticketSeconds: 60, // a one-use chat sign-in ticket
  backupDays: 14, // deploy/backup.sh BACKUP_KEEP
  errorLogBytes: 2_000_000, // services/multiplayer/server.mjs: the error log is cut at this size, keeping one older file
  attributionDays: 30, // @voxelventure/analytics ATTRIBUTION_DAYS: a sale is credited to a button press this far back
  intentDays: 180, // services/api/economy.mjs INTENT_DAYS: the steps towards a plot (card opened, held, price shown...), then deleted
  trafficSeenDays: 2, // services/api/economy.mjs TRAFFIC_SEEN_DAYS: who was already counted in an area that day (hashed), then deleted
  holdMinutes: 3, // services/api/economy.mjs: a claim hold, then deleted
  adminSessionHours: 12, // services/api/admin.mjs SESSION.absoluteMs: a staff sign-in to the admin pages, at most
  adminIdleHours: 2, // ...and SESSION.idleMs without a request
  adminLinkMinutes: 30, // services/api/admin.mjs LINK_MS: a staff password reset or email confirmation link
  offsiteBackupDays: 30, // deploy/backup.sh RCLONE_KEEP: the off-site copies in the bucket are deleted after this

  // ---- the clean-up jobs: services/api/retention.mjs reads these numbers from here (run every hour by services/api/server.mjs), so the
  // retention policy and the jobs cannot disagree (tests/retention.test.mjs checks what each job removes and keeps)
  expiredSessionDays: 1, // a sign-in row is deleted this long after it stopped working
  emailBodyDays: 30, // a sent or failed email's text is wiped; who it went to, its kind, subject and when are kept...
  emailRecordDays: 395, // ...and that record is deleted after 13 months
  eventDays: 395, // visits, clicks, ad views, profile events and stall visits (with visitor numbers and scrambled networks): 13 months, then
  //                 deleted; their daily totals per building, ad space, business or stall (numbers only) are kept, so no figure changes
  arrivalDays: 30, // the country list of arrivals: deleted; the daily count of city visits (a number only) is kept
  couponClaimDays: 395, // a coupon claim's visitor number is removed after 13 months; the claim itself is kept (it counts against the stock)
  leadPendingDays: 30, // a newsletter sign-up never confirmed is deleted
  leadUnsubscribedDays: 30, // a sign-up that unsubscribed is deleted, with its address, this long after
  socialUnpostedDays: 90, // a welcome post that was never posted (rejected, failed or skipped): its text, with the X handle, is wiped
};
