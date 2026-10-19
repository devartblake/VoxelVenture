-- VoxelVenture API schema. Written to be portable to Postgres (types are plain; JSON is stored as text; ids are integers).
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_salt TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  gold INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  expires_at INTEGER NOT NULL
);
-- One row per plot of the world (seeded from the generator). The generated facts never change; the business columns do.
CREATE TABLE IF NOT EXISTS plots (
  id INTEGER PRIMARY KEY,
  district TEXT NOT NULL,
  building_type TEXT,
  owner_account INTEGER REFERENCES accounts(id), -- NULL for the city's own businesses and for empty lots
  owner_name TEXT,                               -- NULL = empty lot, for sale
  title TEXT NOT NULL,
  website TEXT,
  variant TEXT,
  logo TEXT,                                     -- JSON { kind, ... } or NULL (a generated logo)
  description TEXT,
  value INTEGER NOT NULL,
  base_visits INTEGER NOT NULL DEFAULT 0,
  takeovers INTEGER NOT NULL DEFAULT 0,
  claimable INTEGER NOT NULL DEFAULT 1,          -- 0 for Old Town houses and the like
  facts TEXT NOT NULL,                           -- JSON of the generated plot (position, size, tier, interior)
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS plots_value ON plots(value DESC);
-- An owner's redesigned interior (services/api/interiors.mjs, lib/content/interiorDesign.js): what every visitor sees inside the building
-- instead of the interior generated for its kind of business. One per plot. `revision` goes up with every save and every reset, so a save
-- based on an older revision (another tab, another device) is refused instead of overwriting it. `design` is NULL after the owner went back
-- to the generated interior. A claim or a take-over removes the row, and a row saved by anyone but the plot's owner is never served.
CREATE TABLE IF NOT EXISTS plot_interiors (
  plot_id INTEGER PRIMARY KEY REFERENCES plots(id),
  account_id INTEGER NOT NULL REFERENCES accounts(id), -- the owner who saved it
  design TEXT,                                   -- JSON (contract interior.design), or NULL: the generated interior
  revision INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- Every change of hands, newest last. kind: open | claim | takeover
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY,
  plot_id INTEGER NOT NULL REFERENCES plots(id),
  kind TEXT NOT NULL,
  account_id INTEGER REFERENCES accounts(id),
  owner_name TEXT,
  title TEXT NOT NULL,
  price INTEGER NOT NULL,
  paid_to TEXT,                                  -- the previous owner who was paid out (take-over)
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_plot ON ledger(plot_id, id);
-- Visitor events. kind: visit (entered the building) | click (pressed Visit website). source: street|billboard|banner|search|friends
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  plot_id INTEGER NOT NULL REFERENCES plots(id),
  kind TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'street',
  visitor TEXT NOT NULL,                         -- an account id, or an anonymous id from the client
  seconds INTEGER,                               -- time spent (visits)
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_plot ON events(plot_id, at);

-- Ad slots: the billboards and the two aerial banners. One row per slot (seeded from the generator); the ad on it changes when bought out.
CREATE TABLE IF NOT EXISTS ad_slots (
  id TEXT PRIMARY KEY,                           -- billboard-avenue-1-saas, banner-1, ...
  kind TEXT NOT NULL,                            -- billboard | banner
  label TEXT NOT NULL,                           -- the road or the airline
  facts TEXT NOT NULL,                           -- JSON: position, size
  ad TEXT,                                       -- JSON { advertiser, headline, tagline, url, color } or NULL (open)
  owner_account INTEGER REFERENCES accounts(id),
  value INTEGER NOT NULL,
  base_views INTEGER NOT NULL DEFAULT 0,
  base_clicks INTEGER NOT NULL DEFAULT 0,
  takeovers INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ad_ledger (
  id INTEGER PRIMARY KEY,
  slot_id TEXT NOT NULL REFERENCES ad_slots(id),
  account_id INTEGER REFERENCES accounts(id),
  advertiser TEXT NOT NULL,
  headline TEXT NOT NULL,
  price INTEGER NOT NULL,
  paid_to TEXT,                                  -- the advertiser who was bought out
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ad_ledger_slot ON ad_ledger(slot_id, id);
CREATE TABLE IF NOT EXISTS ad_events (
  id INTEGER PRIMARY KEY,
  slot_id TEXT NOT NULL REFERENCES ad_slots(id),
  kind TEXT NOT NULL,                            -- view | click
  visitor TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ad_events_slot ON ad_events(slot_id, at);

-- ---- engagement: storefront offers, leads, feedback, quests, wallet, email ---------------------------------------------
-- Coupons a visitor has claimed (one per visitor per business; the code is the business's).
CREATE TABLE IF NOT EXISTS coupon_claims (
  plot_id INTEGER NOT NULL REFERENCES plots(id),
  visitor TEXT NOT NULL,                         -- a<account id> or x<anonymous id>
  code TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (plot_id, visitor)
);
-- Email sign-ups from a business, an ad space, or the world newsletter. Double opt-in: only 'confirmed' addresses are ever used.
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY,
  target_kind TEXT NOT NULL,                     -- plot | ad | world
  target_id TEXT NOT NULL,                       -- the plot id, the ad slot id, or 'world'
  email TEXT NOT NULL COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'pending',        -- pending | confirmed | unsubscribed
  token TEXT NOT NULL,                           -- confirms and unsubscribes (random, unguessable)
  source TEXT,
  created_at INTEGER NOT NULL,
  confirmed_at INTEGER,
  UNIQUE (target_kind, target_id, email)
);
CREATE INDEX IF NOT EXISTS leads_target ON leads(target_kind, target_id, status);
-- The feedback board of a business.
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY,
  plot_id INTEGER NOT NULL REFERENCES plots(id),
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  author TEXT NOT NULL,
  message TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,             -- the owner can hide a message
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_plot ON feedback(plot_id, id);
-- Visit quests: a started visit (to check the time spent) and the payouts.
CREATE TABLE IF NOT EXISTS quest_sessions (
  plot_id INTEGER NOT NULL REFERENCES plots(id),
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  started_at INTEGER NOT NULL,
  PRIMARY KEY (plot_id, account_id)
);
CREATE TABLE IF NOT EXISTS quest_claims (
  plot_id INTEGER NOT NULL REFERENCES plots(id),
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  gold INTEGER NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (plot_id, account_id)
);
-- Every movement of Gold in an account's wallet.
CREATE TABLE IF NOT EXISTS gold_ledger (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,                          -- starter | quest | quest_budget | budget_refund
  ref TEXT,
  at INTEGER NOT NULL
);
-- Emails waiting to go out (and a record of what went).
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  kind TEXT NOT NULL,                            -- confirm | verify | takeover | ad_takeover | newsletter
  status TEXT NOT NULL DEFAULT 'pending',        -- pending | sent | failed
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL,
  sent_at INTEGER
);
CREATE INDEX IF NOT EXISTS outbox_status ON outbox(status, id);

-- Reports from players about feedback, a business or an ad. Several people may report the same thing, once each.
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,                            -- feedback | plot | ad
  target_id TEXT NOT NULL,
  reporter INTEGER NOT NULL REFERENCES accounts(id),
  reason TEXT NOT NULL,                          -- spam | offensive | misleading | other
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open',           -- open | resolved
  action TEXT,                                   -- dismiss | remove | ban
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  UNIQUE (kind, target_id, reporter)
);
CREATE INDEX IF NOT EXISTS reports_open ON reports(status, kind, target_id);

-- The pop-up market: the layout an admin sets for each market site each week, and the stalls people rent in it.
-- site_code is the site's ID code (SD-0004); week_start is the Monday of the week (UTC) as YYYY-MM-DD.
CREATE TABLE IF NOT EXISTS market_layouts (
  id INTEGER PRIMARY KEY,
  site_code TEXT NOT NULL,
  week_start TEXT NOT NULL,
  params TEXT NOT NULL,                          -- JSON: style, entrances, stall sizes, booth share, seed
  rates TEXT,                                    -- JSON { prime, busy, standard, quiet } in cents, or NULL for the standard prices
  note TEXT,
  published INTEGER NOT NULL DEFAULT 0,          -- 0 = a draft: not open for booking
  updated_at INTEGER NOT NULL,
  UNIQUE (site_code, week_start)
);
CREATE TABLE IF NOT EXISTS market_bookings (
  id INTEGER PRIMARY KEY,
  site_code TEXT NOT NULL,
  week_start TEXT NOT NULL,
  stall_id TEXT NOT NULL,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  account_name TEXT NOT NULL,
  brand TEXT,
  product TEXT,
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  hours INTEGER NOT NULL,
  cents INTEGER NOT NULL,                        -- the flat price paid for the booking
  goods TEXT,                                    -- JSON [{ name, cents }]: what the stall sells (shown to visitors)
  offer TEXT,                                    -- a one-line offer for visitors
  website TEXT,
  notified_open INTEGER NOT NULL DEFAULT 0,      -- the "opens soon" email has been queued
  notified_close INTEGER NOT NULL DEFAULT 0,     -- the "closed" summary has been queued
  status TEXT NOT NULL DEFAULT 'booked',         -- booked | pending (waiting for its payment, holds the stall until hold_until) | cancelled
  created_at INTEGER NOT NULL
);
-- Visitors who looked at a stall while it was open: one row per visitor per hour.
CREATE TABLE IF NOT EXISTS market_visits (
  booking_id INTEGER NOT NULL REFERENCES market_bookings(id),
  visitor TEXT NOT NULL,
  hour INTEGER NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (booking_id, visitor, hour)
);
CREATE INDEX IF NOT EXISTS market_bookings_stall ON market_bookings(site_code, week_start, stall_id, status);
CREATE INDEX IF NOT EXISTS market_bookings_account ON market_bookings(account_id, status, start_at);

-- Presence and arrivals (see services/api/stats.mjs): who is on the site right now, and every visit to it.
CREATE TABLE IF NOT EXISTS presence (
  visitor TEXT PRIMARY KEY,                      -- an account (a<id>) or an anonymous browser (v<id>)
  country TEXT,                                  -- two-letter code; never an address
  account_id INTEGER REFERENCES accounts(id),
  first_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS presence_last ON presence(last_at);
CREATE TABLE IF NOT EXISTS arrivals (
  id INTEGER PRIMARY KEY,
  visitor TEXT NOT NULL,
  country TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS arrivals_at ON arrivals(at);

-- Building of the Week: finding all three daily collectibles earns a vote for the week; one vote a week per account.
CREATE TABLE IF NOT EXISTS hunt_wins (
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  day TEXT NOT NULL,                             -- YYYY-MM-DD
  at INTEGER NOT NULL,
  PRIMARY KEY (account_id, day)
);
CREATE TABLE IF NOT EXISTS votes (
  week TEXT NOT NULL,                            -- the Monday of the week, YYYY-MM-DD (UTC)
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  plot_id INTEGER NOT NULL REFERENCES plots(id),
  at INTEGER NOT NULL,
  PRIMARY KEY (week, account_id, plot_id)        -- a player's votes of a week (one, two with the stars), each for a different building
);
CREATE INDEX IF NOT EXISTS votes_plot ON votes(week, plot_id);

-- Messaging (docs/architecture/chat_messaging_plan.md, services/api/messaging.mjs): nearby chat evidence, private conversations, blocks, and the
-- account-targeted notices the presence server delivers.
-- A one-use ticket that binds a presence connection to an account (60 seconds; only its hash is kept, like sessions).
CREATE TABLE IF NOT EXISTS messaging_tickets (
  ticket_hash TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  session_hash TEXT NOT NULL,                    -- the sign-in it came from: signing out or a ban ends the binding
  expires_at INTEGER NOT NULL
);
-- Every nearby line an account said, kept a short while (MESSAGING_NEARBY_DAYS) so a report has evidence. No endpoint lists them.
CREATE TABLE IF NOT EXISTS nearby_messages (
  id INTEGER PRIMARY KEY,                        -- sent to clients as "n<id>"
  sender INTEGER NOT NULL REFERENCES accounts(id),
  room TEXT NOT NULL,
  body TEXT,                                     -- NULL once removed or expired
  recipients TEXT NOT NULL,                      -- JSON: the account ids it was delivered to (at most 200)
  state TEXT NOT NULL DEFAULT 'ok',              -- ok | removed | expired
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS nearby_messages_at ON nearby_messages(at);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,                           -- random, not a count
  kind TEXT NOT NULL,                            -- direct | business_inquiry
  pair_key TEXT UNIQUE,                          -- direct only: "<lower account id>:<higher>", so two people have one conversation
  plot_id INTEGER REFERENCES plots(id),          -- business_inquiry: the building, its name and its owner when it was made
  plot_title TEXT,
  owner_account INTEGER REFERENCES accounts(id),
  created_by INTEGER NOT NULL REFERENCES accounts(id),
  created_at INTEGER NOT NULL,
  last_message_id INTEGER NOT NULL DEFAULT 0,
  last_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS conversations_inquiry ON conversations(created_by, plot_id, owner_account);
CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  status TEXT NOT NULL,                          -- accepted | pending (a request waiting for this member) | declined
  muted INTEGER NOT NULL DEFAULT 0,              -- no alerts; the messages still arrive
  last_read INTEGER NOT NULL DEFAULT 0,          -- the id of the newest message this member has seen
  PRIMARY KEY (conversation_id, account_id)
);
CREATE INDEX IF NOT EXISTS conversation_members_account ON conversation_members(account_id, status);
-- The id is the order: pages and read cursors use it; `at` is only for showing.
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  sender INTEGER NOT NULL REFERENCES accounts(id),
  client_id TEXT NOT NULL,                       -- the sender's own id for it: a retry finds the first copy instead of making a second
  body TEXT,                                     -- NULL once removed or expired
  state TEXT NOT NULL DEFAULT 'ok',              -- ok | removed | expired
  at INTEGER NOT NULL,
  UNIQUE (sender, client_id)
);
CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id, id);
CREATE INDEX IF NOT EXISTS messages_sender ON messages(sender, at);
CREATE INDEX IF NOT EXISTS messages_at ON messages(at);
CREATE TABLE IF NOT EXISTS account_blocks (
  blocker INTEGER NOT NULL REFERENCES accounts(id),
  blocked INTEGER NOT NULL REFERENCES accounts(id),
  at INTEGER NOT NULL,
  PRIMARY KEY (blocker, blocked)
);
CREATE INDEX IF NOT EXISTS account_blocks_blocked ON account_blocks(blocked);
-- "Your inbox changed" notices for one account, written with the message (same transaction) and handed to the presence server.
CREATE TABLE IF NOT EXISTS messaging_outbox (
  id INTEGER PRIMARY KEY,                        -- the event id
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  event TEXT NOT NULL,                           -- JSON: { type: 'inbox.changed', conversationId }, never the message itself
  status TEXT NOT NULL DEFAULT 'pending',        -- pending | sent | dead
  attempts INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messaging_outbox_due ON messaging_outbox(status, next_at);
-- Free business profiles (services/api/business.mjs, docs/product/business_funnel.md): a public page per business, no plot needed.
CREATE TABLE IF NOT EXISTS businesses (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,                     -- the public address: /business/<slug>
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,                        -- lib/business/profile.js CATEGORIES
  district TEXT,                                 -- lib/business/profile.js BUSINESS_DISTRICTS, or NULL
  tagline TEXT,
  description TEXT,
  website TEXT,
  cta TEXT NOT NULL,                             -- JSON { kind, url, label }
  plot_id INTEGER UNIQUE REFERENCES plots(id),   -- the owner's 3D building, if linked
  referred_by INTEGER REFERENCES accounts(id),   -- the account whose referral link brought the owner here
  status TEXT NOT NULL DEFAULT 'published',      -- published | removed (by moderation)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS businesses_account ON businesses(account_id);
CREATE INDEX IF NOT EXISTS businesses_list ON businesses(status, category, district);
-- What visitors did on a profile. kind: view | cta. Only verified rows count in an owner's figures (see recordProfileEvent).
CREATE TABLE IF NOT EXISTS business_events (
  id INTEGER PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  kind TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'direct',         -- direct | search | social | referral | city
  ref_account INTEGER REFERENCES accounts(id),   -- the account whose referral link the visitor came through
  visitor TEXT NOT NULL,
  ip_hash TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS business_events_business ON business_events(business_id, at);
CREATE INDEX IF NOT EXISTS business_events_ref ON business_events(ref_account, at);
-- A meeting or quote request a visitor sent from a profile (phase 5, docs/monetization/conversions.md). Emailed to the owner and listed for them;
-- only verified ones (not a bot, the visitor viewed the profile first, within the per-network cap) count as results.
CREATE TABLE IF NOT EXISTS business_inquiries (
  id INTEGER PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  kind TEXT NOT NULL,                            -- meeting | quote
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT,
  preferred TEXT,                                -- meeting: when suits them, in their words
  visitor TEXT NOT NULL,
  ip_hash TEXT,
  source TEXT NOT NULL DEFAULT 'direct',
  campaign TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',            -- new | handled | spam
  created_at INTEGER NOT NULL,
  handled_at INTEGER
);
CREATE INDEX IF NOT EXISTS business_inquiries_business ON business_inquiries(business_id, created_at);
-- An owner asked for a paid upgrade before checkout exists (phase 4): the demand signal for the pricing ladder.
CREATE TABLE IF NOT EXISTS upgrade_interest (
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  plan TEXT NOT NULL,                            -- launch | pro | sponsored
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  at INTEGER NOT NULL,
  PRIMARY KEY (business_id, plan)
);

-- The audit trail (services/api/audit.mjs, docs/architecture/authoritative_data.md): who did what to whom, for every change of ownership, purchase,
-- booking, moderation decision and admin action. Append-only: the triggers refuse any change or deletion, and each row carries the hash
-- of the row before it, so a row edited outside the API (straight in the file) breaks the chain that GET /admin/audit/verify checks.
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  actor_kind TEXT NOT NULL,                      -- account | admin | service | system
  actor_id INTEGER,                              -- the account, for actor_kind account
  action TEXT NOT NULL,                          -- plot.claim, plot.takeover, ad.buy, report.resolve, account.ban, ...
  target_kind TEXT NOT NULL,                     -- plot | ad | business | booking | account | report | market | newsletter
  target_id TEXT,
  detail TEXT,                                   -- JSON: the facts of the change (price, previous owner, decision, ...)
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_target ON audit_log(target_kind, target_id, id);
CREATE INDEX IF NOT EXISTS audit_action ON audit_log(action, id);
CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;

-- Welcome posts on VoxelVenture's X account (services/api/social.mjs, docs/operations/social_posts.md): one per business that opted in, tagging its handle.
CREATE TABLE IF NOT EXISTS social_posts (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,                            -- welcome
  target_kind TEXT NOT NULL,                     -- business | plot
  target_id TEXT NOT NULL,
  account_id INTEGER REFERENCES accounts(id),    -- the owner it welcomes
  text TEXT NOT NULL,                            -- exactly what will be posted
  status TEXT NOT NULL,                          -- review | queued | posted | failed | rejected | skipped
  post_id TEXT,                                  -- X's id for the post, once posted
  attempts INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL,
  decided_at INTEGER,
  posted_at INTEGER,
  UNIQUE (kind, target_kind, target_id)          -- a business is welcomed once
);
CREATE INDEX IF NOT EXISTS social_posts_due ON social_posts(status, next_at);

-- Billing (services/api/billing.mjs, docs/monetization/billing.md): Stripe Checkout for the Launch Pack, Pro and sponsored placements.
-- An order is made before checkout; only Stripe's signed webhook (or the reconciliation job asking Stripe) marks it paid, and only a paid
-- order grants anything. Amounts come from lib/business/plans.js, never from a browser.
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  business_id INTEGER REFERENCES businesses(id),  -- launch, pro and sponsored: the profile they are for
  product TEXT NOT NULL,                         -- launch | pro | sponsored | lease (claim, take over or renew a plot) | market (a stall) | cart (a cart's one payment: its lines are child orders, parent_id)
  target TEXT,                                   -- lease: plot:<id>; market: booking:<id>
  request TEXT,                                  -- lease: JSON { action, input }: what is done once it is paid
  label TEXT,                                    -- what was bought, in words (the order lists)
  placement TEXT,                                -- sponsored: discover | category:<id> | district:<id>
  cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending',        -- pending | paid | expired | refunded | failed
  stripe_session TEXT UNIQUE,
  stripe_payment_intent TEXT,
  stripe_subscription TEXT,
  hold_until INTEGER,                            -- sponsored: the spot is held for checkout until then
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  refunded_at INTEGER,
  note TEXT
);
CREATE INDEX IF NOT EXISTS orders_business ON orders(business_id, id);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS orders_target ON orders(target, status);
-- The cart (services/api/cart.mjs, docs/monetization/billing.md#the-cart): one per account, its lines, each priced on the server. Adding a line holds
-- nothing; checkout holds every line at once and makes one parent order (product 'cart') with a child order per line (orders.parent_id).
CREATE TABLE IF NOT EXISTS carts (
  account_id INTEGER PRIMARY KEY REFERENCES accounts(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cart_items (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES carts(account_id),
  kind TEXT NOT NULL,                            -- claim | takeover | renew | exterior | launch | pro | sponsored | stall
  target TEXT NOT NULL,                          -- plot:<id> | business:<id> | stall:<site>:<week>:<stall>:<start>
  business_id INTEGER REFERENCES businesses(id), -- launch, pro and sponsored: the profile they are for
  placement TEXT,                                -- sponsored: discover | category:<id> | district:<id>
  request TEXT,                                  -- JSON: what the line does (a plot's setup, a stall's booking), cleaned
  label TEXT NOT NULL,
  cents INTEGER NOT NULL,                        -- the server's price, at add time (and again at checkout)
  discount_cents INTEGER NOT NULL DEFAULT 0,     -- of which the Pro plot discount took off this much
  previous_cents INTEGER,                        -- the price before checkout found it changed (shown until the next checkout)
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cart_items_account ON cart_items(account_id, id);
-- Every Stripe event applied, by its id: a webhook delivered twice (Stripe retries) is applied once.
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  received_at INTEGER NOT NULL
);
-- What a paid order grants, for how long. Pro's end moves with each paid month; a refund or a cancellation ends it.
CREATE TABLE IF NOT EXISTS entitlements (
  id INTEGER PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  order_id INTEGER NOT NULL REFERENCES orders(id),
  kind TEXT NOT NULL,                            -- launch | pro | sponsored
  placement TEXT,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',         -- active | revoked
  UNIQUE (order_id)
);
CREATE INDEX IF NOT EXISTS entitlements_business ON entitlements(business_id, kind, ends_at);
CREATE INDEX IF NOT EXISTS entitlements_placement ON entitlements(placement, ends_at);
-- The constrained pilot (phase 6, services/api/pilot.mjs, docs/monetization/pilot.md): which businesses take part, when the owner came back,
-- and what they told us each week. Read by the admin's pilot dashboard (GET /admin/pilot).
CREATE TABLE IF NOT EXISTS pilot_members (
  business_id INTEGER PRIMARY KEY REFERENCES businesses(id),
  joined_at INTEGER NOT NULL,
  left_at INTEGER,                               -- taken out of the pilot (kept, so the record stays complete)
  note TEXT                                      -- the admin's own note: how they were recruited, who to talk to
);
-- An owner used their dashboard (or changed their profile) in a week (UTC, from Monday): the retention signal. One row per profile per week.
CREATE TABLE IF NOT EXISTS owner_activity (
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  week TEXT NOT NULL,                            -- the Monday it starts, YYYY-MM-DD
  first_at INTEGER NOT NULL,
  PRIMARY KEY (business_id, week)
);
-- A pilot business's weekly feedback (one per week; sending it again that week replaces it).
CREATE TABLE IF NOT EXISTS pilot_feedback (
  id INTEGER PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  week TEXT NOT NULL,
  rating INTEGER NOT NULL,                       -- 1 to 5: how useful VoxelVenture was to the business this week
  result TEXT,                                   -- what it brought (a customer, a booking), in their words
  missing TEXT,                                  -- what would make it more useful
  would_pay TEXT NOT NULL,                       -- yes | maybe | no: would they pay for it as it is
  created_at INTEGER NOT NULL,
  UNIQUE (business_id, week)
);

-- ---- The plot economy's data (services/api/economy.mjs, docs/monetization/plot_economy_data.md) ---------------------------------------------
-- The server's claim hold: a player setting an empty plot up holds it for three minutes; nobody else can hold, claim or take it over meanwhile.
-- One per plot and one per account. A hold that runs out is deleted (and its `abandoned` step written) by the minute's sweep.
CREATE TABLE IF NOT EXISTS plot_holds (
  plot_id INTEGER PRIMARY KEY REFERENCES plots(id),
  account_id INTEGER NOT NULL UNIQUE REFERENCES accounts(id),
  started_at INTEGER NOT NULL,
  hold_until INTEGER NOT NULL,
  verified INTEGER NOT NULL DEFAULT 1            -- the `hold` step counted: its `abandoned` step is counted the same
);
-- Each step a player took towards a plot (lib/game/economy.js INTENT_STEPS): opening its card, the hold, the price shown, the checkout, the claim
-- or take-over, a refusal, a hold given up. Kept 180 days (the daily figures in the report are worked out from it). `verified` as for visits: not a
-- robot, not the plot's own tenant, within the per-network daily cap.
CREATE TABLE IF NOT EXISTS plot_intents (
  id INTEGER PRIMARY KEY,
  plot_id INTEGER NOT NULL REFERENCES plots(id),
  kind TEXT NOT NULL,                            -- claim | takeover
  step TEXT NOT NULL,
  account_id INTEGER REFERENCES accounts(id),    -- a signed-in player
  visitor TEXT,                                  -- otherwise the visitor number, hashed (sha256 with IP_SALT, 16 hex)
  ip_hash TEXT,                                  -- the network, hashed as for visits
  price_cents INTEGER,                           -- quote, checkout, claimed, taken_over: the price, in cents
  term_days INTEGER,                             -- ...and the lease term it was for
  at INTEGER NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS plot_intents_at ON plot_intents(at);
CREATE INDEX IF NOT EXISTS plot_intents_plot ON plot_intents(plot_id, step, at);
-- Foot traffic: the players who passed through each area (lib/game/economy.js areaOf: a 24-unit square of the map) each day. `passes` counts a
-- player once an hour per area, `players` once a day. Kept.
CREATE TABLE IF NOT EXISTS street_traffic (
  day TEXT NOT NULL,                             -- YYYY-MM-DD (UTC)
  area_id TEXT NOT NULL,
  passes INTEGER NOT NULL DEFAULT 0,
  players INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, area_id)
);
-- Who has already been counted in an area today (hashed, never the visitor number itself), so a player is one player however often they pass and
-- however often the server restarts. Deleted after two days.
CREATE TABLE IF NOT EXISTS traffic_seen (
  day TEXT NOT NULL,
  area_id TEXT NOT NULL,
  who TEXT NOT NULL,                             -- sha256(IP_SALT | presence id), 16 hex
  ip_hash TEXT,                                  -- the network, for the per-network cap
  hours INTEGER NOT NULL DEFAULT 0,              -- a bit per hour (UTC) the player passed
  PRIMARY KEY (day, area_id, who)
);
-- "Watch this plot": a signed-in player is emailed when an occupied plot's lease enters its grace week and when it opens to a buyout (once each per
-- lease end). Only admins see how many watch a plot.
CREATE TABLE IF NOT EXISTS plot_watches (
  plot_id INTEGER NOT NULL REFERENCES plots(id),
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  created_at INTEGER NOT NULL,
  notified TEXT,                                 -- the last notice sent: '<grace|open>:<lease end>'
  PRIMARY KEY (plot_id, account_id)
);
CREATE INDEX IF NOT EXISTS plot_watches_account ON plot_watches(account_id);
