import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

// Opens the database (a file, or ':memory:') and creates the tables.
export function openDb(file = ':memory:') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql'), 'utf8'));
  // columns added after the first version: a database made earlier is upgraded in place
  addColumn(db, 'race_laps', 'vehicle', "TEXT NOT NULL DEFAULT 'car'");
  addColumn(db, 'accounts', 'email', 'TEXT');
  addColumn(db, 'accounts', 'email_verified', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'accounts', 'email_token', 'TEXT');
  addColumn(db, 'accounts', 'notify', 'INTEGER NOT NULL DEFAULT 1');
  addColumn(db, 'accounts', 'banned', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'accounts', 'ban_reason', 'TEXT');
  addColumn(db, 'market_bookings', 'goods', 'TEXT');
  addColumn(db, 'market_bookings', 'offer', 'TEXT');
  addColumn(db, 'market_bookings', 'website', 'TEXT');
  addColumn(db, 'market_bookings', 'notified_open', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'market_bookings', 'hold_until', 'INTEGER'); // a pending booking (waiting for its payment) holds the stall until then
  addColumn(db, 'market_bookings', 'notified_close', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'events', 'ip_hash', 'TEXT');
  addColumn(db, 'events', 'verified', 'INTEGER NOT NULL DEFAULT 1');
  addColumn(db, 'plots', 'lease_days', 'INTEGER');
  addColumn(db, 'plots', 'lease_start', 'INTEGER');
  addColumn(db, 'plots', 'lease_end', 'INTEGER');
  addColumn(db, 'plots', 'lease_notified', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'plots', 'brand', 'TEXT');
  addColumn(db, 'plots', 'quest_budget', 'INTEGER NOT NULL DEFAULT 0');
  upgradeVotes(db);
  // purchase reporting (conversions.mjs): each business's own conversion key, stored as a hash only, and where a purchase report came from
  addColumn(db, 'businesses', 'conv_key_hash', 'TEXT'); // sha256 of the business's conversion key (the key is shown to the owner once)
  addColumn(db, 'businesses', 'conv_key_at', 'INTEGER'); // when it was made (a new one replaces it)
  addColumn(db, 'business_events', 'report', 'TEXT'); // a purchase: 'server' (authenticated postback) or 'browser' (the pixel: unverified)
  addColumn(db, 'accounts', 'dm_requests', 'INTEGER NOT NULL DEFAULT 1'); // 0: nobody new can send this account a message request
  addColumn(db, 'reports', 'evidence', 'TEXT'); // a reported chat message as it was when reported (JSON)
  addColumn(db, 'business_events', 'campaign', 'TEXT'); // utm_campaign of the link the visitor came by (business.mjs)
  addColumn(db, 'businesses', 'x_handle', 'TEXT'); // the owner's X handle, without the @ (optional)
  addColumn(db, 'business_events', 'click_id', 'TEXT'); // a press of the call to action: the id added to its link (docs/monetization/conversions.md)
  addColumn(db, 'business_events', 'value_cents', 'INTEGER'); // a purchase: its value
  addColumn(db, 'business_events', 'order_ref', 'TEXT'); // a purchase: the business's own order number (a purchase is counted once)
  addColumn(db, 'business_events', 'surface', 'TEXT'); // the screen it happened on (business.mjs SURFACES), or NULL when not told
  db.exec('CREATE INDEX IF NOT EXISTS business_events_click ON business_events(business_id, click_id)');
  addColumn(db, 'coupon_claims', 'ticket', 'TEXT'); // one per claim, so the owner can mark exactly that claim redeemed
  addColumn(db, 'coupon_claims', 'redeemed_at', 'INTEGER');
  addColumn(db, 'orders', 'renewals', 'INTEGER NOT NULL DEFAULT 0'); // Pro: paid months after the first (the renewal rate)
  addColumn(db, 'businesses', 'offer', 'TEXT'); // Pro: a one-line offer shown on the public page (business.mjs setOffer)
  addColumn(db, 'businesses', 'offer_until', 'INTEGER'); // when the offer ends, or NULL for no end date
  addColumn(db, 'businesses', 'announce', 'INTEGER NOT NULL DEFAULT 0'); // 1: the owner agreed to a welcome post on VoxelVenture's X account that tags them
  addColumn(db, 'plots', 'exterior', 'TEXT'); // JSON: the outside the owner set up (lib/game/exterior.js), or NULL for the usual one
  addColumn(db, 'ad_events', 'ip_hash', 'TEXT');
  addColumn(db, 'ad_events', 'verified', 'INTEGER NOT NULL DEFAULT 0'); // rows from before verification are not counted
  addColumn(db, 'accounts', 'referred_by', 'INTEGER REFERENCES accounts(id)'); // the account whose referral link brought this one (business.mjs)
  addColumn(db, 'accounts', 'ref_code', 'TEXT'); // the account's random referral code (business.mjs referralCode), made when first asked for
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS accounts_ref_code ON accounts(ref_code) WHERE ref_code IS NOT NULL');
  // when a visitor first came through each referrer's link: a link credits its sharer for 30 days from then (business.mjs)
  // which week's summary email each profile was sent (business.mjs sendOwnerSummaries)
  db.exec('CREATE TABLE IF NOT EXISTS owner_summaries (business_id INTEGER NOT NULL, week TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (business_id, week))');
  db.exec('CREATE TABLE IF NOT EXISTS ref_firsts (visitor TEXT NOT NULL, ref_account INTEGER NOT NULL, first_at INTEGER NOT NULL, PRIMARY KEY (visitor, ref_account))');
  addColumn(db, 'orders', 'parent_id', 'INTEGER REFERENCES orders(id)'); // a cart's line: the cart's own order (product 'cart') it was paid with (cart.mjs)
  db.exec('CREATE INDEX IF NOT EXISTS orders_parent ON orders(parent_id)');
  addColumn(db, 'orders', 'promo_code', 'TEXT'); // the promo code this order was bought with (promo.mjs); a cart's lines carry it too
  addColumn(db, 'orders', 'promo_cents', 'INTEGER NOT NULL DEFAULT 0'); // what the code took off this order (cents is what was charged)
  addColumn(db, 'carts', 'promo_code', 'TEXT'); // the code applied to the cart (checked again at checkout)
  addColumn(db, 'admin_accounts', 'email', 'TEXT'); // an admin's address for password resets (services/api/admin.mjs)
  addColumn(db, 'admin_accounts', 'email_verified_at', 'INTEGER'); // when its one-use link was opened; NULL: not confirmed
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS admin_accounts_email ON admin_accounts(email) WHERE email IS NOT NULL');
  // The game's Gold, held by the server (services/api/gold.mjs; docs/architecture/backend.md, "Currency"). accounts.gold is the CREDITS wallet (its name is from before
  // there were two); the Gold is accounts.game_gold, moved only through game_gold_ledger. Every row's `key` is unique per account, which is what makes a claim happen once.
  addColumn(db, 'accounts', 'game_gold', 'INTEGER NOT NULL DEFAULT 0');
  db.exec(`CREATE TABLE IF NOT EXISTS game_gold_ledger (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    ref TEXT,
    key TEXT NOT NULL,
    at INTEGER NOT NULL,
    evidence TEXT,
    UNIQUE (account_id, key)
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS game_gold_ledger_account ON game_gold_ledger(account_id, id)');
  db.exec('CREATE TABLE IF NOT EXISTS game_inventory (account_id INTEGER NOT NULL REFERENCES accounts(id), item_id TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (account_id, item_id))');
  db.exec("CREATE TABLE IF NOT EXISTS game_profile (account_id INTEGER PRIMARY KEY REFERENCES accounts(id), appearance TEXT NOT NULL DEFAULT '{}')");
  db.exec('CREATE TABLE IF NOT EXISTS game_timers (account_id INTEGER NOT NULL REFERENCES accounts(id), key TEXT NOT NULL, started_at INTEGER NOT NULL, PRIMARY KEY (account_id, key))');
  // Presence-verified positions (services/api/presence.mjs; docs/architecture/presence_positions.md). DERIVED events about where an account was, sent by the presence server after it checked
  // the movement was plausible: never a track. Kept RETENTION.presenceEventDays days. The unique key makes a repeated batch store once; an 'in' event keeps one row per place, phase and
  // ten minutes (`bucket`), a distance one row per event (its `bucket` is its own time). And the anti-bot flags the presence server reports: a score at or over the review score holds
  // an account's task rewards back until it clears, expires, or an admin clears it for a day.
  db.exec(`CREATE TABLE IF NOT EXISTS presence_events (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    kind TEXT NOT NULL,
    ref TEXT NOT NULL,
    phase TEXT NOT NULL DEFAULT '',
    bucket INTEGER NOT NULL,
    mode TEXT NOT NULL DEFAULT '',
    district TEXT NOT NULL DEFAULT '',
    first_at INTEGER NOT NULL,
    last_at INTEGER NOT NULL,
    n INTEGER NOT NULL DEFAULT 1,
    dwell INTEGER NOT NULL DEFAULT 0,
    metres INTEGER NOT NULL DEFAULT 0,
    UNIQUE (account_id, kind, ref, phase, bucket, mode, district)
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS presence_events_account ON presence_events(account_id, last_at)');
  db.exec('CREATE INDEX IF NOT EXISTS presence_events_age ON presence_events(last_at)');
  db.exec(`CREATE TABLE IF NOT EXISTS presence_flags (
    account_id INTEGER PRIMARY KEY REFERENCES accounts(id),
    score INTEGER NOT NULL,
    flags TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    first_flagged_at INTEGER NOT NULL,
    held_at INTEGER,
    cleared_by TEXT,
    cleared_at INTEGER,
    cleared_until INTEGER
  )`);
  // Player tasks (services/api/tasks.mjs; docs/product/daily_weekly_tasks.md): what an account collected (once per task and period, which the unique key enforces), and which
  // tasks were shown to which account (so an admin can see how many were offered as well as collected). Progress is never stored: it is worked out again from the
  // server's own records each time.
  db.exec(`CREATE TABLE IF NOT EXISTS task_claims (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    task_id TEXT NOT NULL,
    period_key TEXT NOT NULL,
    cadence TEXT NOT NULL,
    tier TEXT NOT NULL,
    category TEXT NOT NULL,
    gold INTEGER NOT NULL,
    claimed_at INTEGER NOT NULL,
    day TEXT NOT NULL,
    evidence TEXT,
    UNIQUE (account_id, task_id, period_key)
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS task_claims_account ON task_claims(account_id, claimed_at)');
  db.exec('CREATE INDEX IF NOT EXISTS task_claims_task ON task_claims(task_id)');
  db.exec('CREATE TABLE IF NOT EXISTS task_offers (account_id INTEGER NOT NULL REFERENCES accounts(id), task_id TEXT NOT NULL, period_key TEXT NOT NULL, first_seen_at INTEGER NOT NULL, PRIMARY KEY (account_id, task_id, period_key))');
  // Reserve the graphics backlog IDs without asserting descriptions or completion.
  const seedRollout = db.prepare('INSERT OR IGNORE INTO rollout_items (id,title) VALUES (?,?)');
  for (let n=1;n<=13;n++) {
    const id = `VV-GFX-${String(n).padStart(2,'0')}`;
    seedRollout.run(id, `Graphics backlog ${id} — definition pending`);
  }
  return db;
}

// Building of the Week once allowed one vote a player a week (key: week + account). Now a player can have two, for different buildings
// (key: week + account + building). A database made before is rebuilt once, keeping every vote.
function upgradeVotes(db) {
  const key = db.prepare('PRAGMA table_info(votes)').all().filter((c) => c.pk > 0).length;
  if (key !== 2) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`CREATE TABLE votes_upgraded (week TEXT NOT NULL, account_id INTEGER NOT NULL REFERENCES accounts(id), plot_id INTEGER NOT NULL REFERENCES plots(id), at INTEGER NOT NULL, PRIMARY KEY (week, account_id, plot_id));
      INSERT INTO votes_upgraded (week, account_id, plot_id, at) SELECT week, account_id, plot_id, at FROM votes;
      DROP TABLE votes;
      ALTER TABLE votes_upgraded RENAME TO votes;
      CREATE INDEX IF NOT EXISTS votes_plot ON votes(week, plot_id);`);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function addColumn(db, table, column, definition) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

// Runs fn inside one transaction: all or nothing, and nobody else writes meanwhile (this is what makes a claim atomic).
// Re-entrant: a transaction opened inside another joins it, so a route can wrap a change and its audit record (audit.mjs) in one
// transaction even though the change opens its own. Any error rolls the whole outer transaction back.
const depth = new WeakMap();
// Runs fn; if it throws, everything it wrote is undone (also inside a larger transaction, which carries on) and the error is passed on.
export function attempt(db, fn) {
  return transaction(db, () => {
    db.exec('SAVEPOINT attempt');
    try {
      const out = fn();
      db.exec('RELEASE attempt');
      return out;
    } catch (e) {
      db.exec('ROLLBACK TO attempt');
      db.exec('RELEASE attempt');
      throw e;
    }
  });
}

// Runs fn to see what it would do (its checks, what it would write), then undoes everything it wrote. Returns fn's result.
export function dryRun(db, fn) {
  return transaction(db, () => {
    db.exec('SAVEPOINT dry_run');
    try {
      return fn();
    } finally {
      db.exec('ROLLBACK TO dry_run');
      db.exec('RELEASE dry_run');
    }
  });
}

export function transaction(db, fn) {
  const d = depth.get(db) ?? 0;
  if (d > 0) {
    depth.set(db, d + 1);
    try {
      return fn();
    } finally {
      depth.set(db, d);
    }
  }
  db.exec('BEGIN IMMEDIATE');
  depth.set(db, 1);
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    depth.set(db, 0);
  }
}
