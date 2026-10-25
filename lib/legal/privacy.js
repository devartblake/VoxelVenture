// What downloading your data and deleting your account do, in one place: the API (services/api/privacy.mjs) answers with these lists, the
// confirmation screens show them (apps/web/components/legal/PrivacyControls.jsx), and the privacy policy quotes them (lib/legal/policies.js).
// No imports, so a browser component can use it.

export const PRIVACY = {
  exportsPerDay: 3, // GET /me/export, per account
  deleteTries: 5, // wrong passwords when deleting, per account, in 15 minutes
  gracePeriodDays: 0, // none: the account is deleted at once (the password, the name typed and the confirmation screen are the safeguard)
};

// What deleting an account removes.
export const REMOVED = [
  'Your name (the account becomes deleted-<number>), password, email address and notice settings.',
  'Every sign-in, on every device, and your chat connection.',
  'Your business pages, with their meeting and quote requests and newsletter sign-ups.',
  'The text of your messages, nearby chat lines and feedback posts.',
  'Your newsletter sign-ups, the emails we sent you or still had to send, your watched plots, your cart, any plot you were holding and market stalls booked for later.',
  'Plots and ad spaces you hold now: they are released at once, for anyone to claim.',
];

// What stays, and why.
export const KEPT = [
  { what: 'Orders and payments: amounts, dates and what was bought (never card details: Stripe holds those)', why: 'accounting and tax law' },
  { what: 'The action log', why: 'security and accountability: it cannot be changed or deleted. Its entries name the account by number, and some by the name it had then' },
  { what: 'Plot and ad history, and the Credits ledger, under the name deleted-<number>', why: 'the record of who held what at what price, which other players\' history depends on' },
  { what: 'Visits, coupon claims and votes, with a random number in place of the account', why: 'businesses\' figures and past results stay right' },
  { what: 'Reports you made, without your note; a message of yours that someone reported, until the report is decided', why: 'moderation' },
  { what: 'A welcome post already made on our X account', why: 'it is on X, not here: write to us to have it taken down' },
];

// What happens to money (the confirmation screen says it, with a link to the refund policy).
// The amount itself is worked out for the account and shown above these (GET /me/prorata).
export const MONEY_ON_DELETE = [
  'First, the unused time of what you paid for is refunded to your card: the unused days of a plot lease, an ad space or sponsored week, and the month of Pro; a renewal or booking not started yet, and a stall booked for later, in full. Under $1 for one thing is not refunded, and Stripe\'s fee is not taken off.',
  'Nothing is refunded for the Launch Pack or a building upgrade (delivered), or while a payment is disputed.',
  'Pro is cancelled in Stripe at once, so it is not charged again.',
];

// What deleting a business page does (DELETE /businesses/:slug).
export const PAGE_DELETE = [
  'The page goes from its address, from Discover and from search engines\' sitemap. Its name can be used again.',
  'If it is linked to a building in the city, the link goes; the building stays yours.',
  'Its meeting and quote requests and newsletter sign-ups are deleted: download what you need first.',
  'Its figures are kept in total only (how many visits, presses and requests it had), not who made them.',
  'Pro on it is cancelled in Stripe at once. No refund is made automatically.',
];
