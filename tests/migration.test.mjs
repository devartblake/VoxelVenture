// Upgrading a database in place (P0 "database migration tests"): a database as the first release left it (tests/fixtures/schema-v1.sql),
// with some data in it, is opened by today's code. Every new table and column must appear, nothing may be lost, opening it again must
// change nothing, and the API must run on it. (deploy/README.md: "The API upgrades the database in place when it starts".)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { root } from './helpers.mjs';
import { openDb } from '../services/api/db.mjs';
import { createApi } from '../services/api/server.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-migrate-'));
const file = path.join(dir, 'old.db');

// ---- the old database, with an account, an owned plot and its events, an ad slot with views
const old = new DatabaseSync(file);
old.exec(fs.readFileSync(path.join(root, 'tests', 'fixtures', 'schema-v1.sql'), 'utf8'));
const t = Date.now();
old.prepare("INSERT INTO accounts (id, username, pass_salt, pass_hash, created_at, email) VALUES (1, 'oldtimer', 's', 'h', ?, 'old@x.test')").run(t);
old.prepare("INSERT INTO plots (id, district, building_type, owner_account, owner_name, title, website, value, base_visits, facts, updated_at, lease_days, lease_end) VALUES (5, 'saas', 'shop', 1, 'oldtimer', 'Old Shop', 'https://old.test', 999, 1234, ?, ?, 365, ?)").run(JSON.stringify({ x: 1, z: 2, w: 3, d: 3, district: 'SaaS Silicon Strip', prime: false, luxury: false, grand: false, height: 1.5 }), t, t + 86400000);
old.prepare("INSERT INTO events (plot_id, kind, source, visitor, seconds, at, verified) VALUES (5, 'visit', 'street', 'a2', 30, ?, 1)").run(t);
old.prepare("INSERT INTO ad_slots (id, kind, label, facts, value, base_views, updated_at) VALUES ('banner-1', 'banner', 'Air', '{}', 100, 500, ?)").run(t);
old.prepare("INSERT INTO ad_events (slot_id, kind, visitor, at) VALUES ('banner-1', 'view', 'x1', ?)").run(t);
const cols = (db, table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
const before = Object.fromEntries(['accounts', 'plots', 'events', 'ad_events'].map((tb) => [tb, cols(old, tb)]));
check('(the old database has no business profiles, audit trail or posts)', !old.prepare("SELECT name FROM sqlite_master WHERE name IN ('businesses', 'audit_log', 'social_posts')").all().length);
old.close();

// ---- today's code opens it
const db = openDb(file);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
for (const tb of ['businesses', 'business_events', 'upgrade_interest', 'audit_log', 'social_posts', 'plot_interiors']) check(`the new table ${tb} is created`, tables.includes(tb));
const added = { accounts: ['referred_by'], plots: ['exterior'], ad_events: ['ip_hash', 'verified'], business_events: ['campaign'], businesses: ['x_handle', 'announce'] };
for (const [tb, list] of Object.entries(added)) check(`${tb} gains ${list.join(', ')}`, list.every((c) => cols(db, tb).includes(c)));
check('every old column is still there', Object.entries(before).every(([tb, list]) => list.every((c) => cols(db, tb).includes(c))));
const plot = db.prepare('SELECT * FROM plots WHERE id = 5').get();
check('the owned plot, its lease and its owner are untouched', plot.owner_name === 'oldtimer' && plot.title === 'Old Shop' && plot.lease_days === 365 && plot.exterior === null && plot.base_visits === 1234);
check('the account keeps its email and has no referrer', db.prepare('SELECT email, referred_by FROM accounts WHERE id = 1').get().email === 'old@x.test' && db.prepare('SELECT referred_by FROM accounts WHERE id = 1').get().referred_by === null);
check('old building visits stay verified (they were checked when recorded)', db.prepare('SELECT verified FROM events').get().verified === 1);
check('old ad events, recorded before ad verification, are kept but not counted', db.prepare('SELECT COUNT(*) AS n FROM ad_events').get().n === 1 && db.prepare('SELECT verified FROM ad_events').get().verified === 0);
check('the audit triggers are in place', db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'audit_log_no_%'").get().n === 2);
db.close();

// ---- opening it again changes nothing, and the API runs on it
const again = openDb(file);
const schema1 = again.prepare('SELECT sql FROM sqlite_master ORDER BY name').all().map((r) => r.sql).join('\n');
again.close();
const third = openDb(file);
check('opening it a second time changes nothing', schema1 === third.prepare('SELECT sql FROM sqlite_master ORDER BY name').all().map((r) => r.sql).join('\n'));
third.close();
const api = createApi({ dbFile: file, deliverEveryMs: 0, env: {} });
await new Promise((r) => api.server.listen(0, r));
const base = `http://localhost:${api.server.address().port}`;
const got = await (await fetch(`${base}/plots/5`)).json();
check('the API serves the old plot with its verified visit only (not the generated 1,234)', got.title === 'Old Shop' && got.visits === 1 && got.exterior === null, JSON.stringify({ t: got.title, v: got.visits }));
check('and the old ad slot with no unverified views', (await (await fetch(`${base}/ads/banner-1`)).json()).views === 0);
const made = await fetch(`${base}/auth/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'newcomer', password: 'longenough1' }) });
check('new accounts work, and are audited', made.status === 200 && api.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'account.create'").get().n === 1);
const inside = await (await fetch(`${base}/plots/5/interior`)).json();
check('the old plot has no redesigned interior: it shows the generated one', inside.design === null && inside.revision === 0, JSON.stringify(inside));
await api.close();
fs.rmSync(dir, { recursive: true, force: true });

console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails ? 1 : 0);
