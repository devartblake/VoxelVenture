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
  addColumn(db, 'accounts', 'dm_requests', 'INTEGER NOT NULL DEFAULT 1'); // 0: nobody new can send this account a message request
  addColumn(db, 'reports', 'evidence', 'TEXT'); // a reported chat message as it was when reported (JSON)
  addColumn(db, 'business_events', 'campaign', 'TEXT'); // utm_campaign of the link the visitor came by (business.mjs)
  addColumn(db, 'businesses', 'x_handle', 'TEXT'); // the owner's X handle, without the @ (optional)
  addColumn(db, 'businesses', 'offer', 'TEXT'); // Pro: a one-line offer shown on the public page (business.mjs setOffer)
  addColumn(db, 'businesses', 'offer_until', 'INTEGER'); // when the offer ends, or NULL for no end date
  addColumn(db, 'businesses', 'announce', 'INTEGER NOT NULL DEFAULT 0'); // 1: the owner agreed to a welcome post on VoxelVenture's X account that tags them
  addColumn(db, 'plots', 'exterior', 'TEXT'); // JSON: the outside the owner set up (lib/game/exterior.js), or NULL for the usual one
  addColumn(db, 'ad_events', 'ip_hash', 'TEXT');
  addColumn(db, 'ad_events', 'verified', 'INTEGER NOT NULL DEFAULT 0'); // rows from before verification are not counted
  addColumn(db, 'accounts', 'referred_by', 'INTEGER REFERENCES accounts(id)'); // the account whose referral link brought this one (business.mjs)
  return db;
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
