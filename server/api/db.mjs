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
  addColumn(db, 'accounts', 'referred_by', 'INTEGER REFERENCES accounts(id)'); // the account whose referral link brought this one (business.mjs)
  return db;
}

function addColumn(db, table, column, definition) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

// Runs fn inside one transaction: all or nothing, and nobody else writes meanwhile (this is what makes a claim atomic).
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
