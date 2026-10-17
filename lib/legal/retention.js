// How long things are kept, as the policies state it (lib/legal/facts.js re-exports this; tests/legal.test.mjs checks every number against
// the code). No imports, so a browser component can quote a period without pulling in anything else.
export const RETENTION = {
  sessionDays: 30, // server/api/core.mjs: a sign-in lasts 30 days
  inquiryDays: 180, // server/api/conversions.mjs INQUIRY_DAYS: then a request's contact details and message are wiped
  nearbyDays: 7, // server/api/messaging.mjs: nearby chat kept as evidence for reports, then wiped
  nearbyDeleteDays: 37, // ...and the row deleted 30 days after that, unless it was reported
  inboxDays: 90, // private messages: the text is wiped after this
  reportEvidenceDays: 180, // a reported message's copy, after the report is decided
  presenceDays: 1, // server/api/stats.mjs: who is online now
  referralDays: 30, // lib/business/referral.js: the referral code kept in the browser
  ticketSeconds: 60, // a one-use chat sign-in ticket
  backupDays: 14, // deploy/backup.sh BACKUP_KEEP
  errorLogBytes: 2_000_000, // server/multiplayer.mjs: the error log is cut at this size, keeping one older file
  attributionDays: 30, // @voxelventure/analytics ATTRIBUTION_DAYS: a sale is credited to a button press this far back
};
