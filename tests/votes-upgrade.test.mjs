// Building of the Week's votes table: a database made when a player had one vote a week (key: week + account) is rebuilt once to allow
// two (key: week + account + building), keeping every vote. Also the shared rules in lib/game/buildingOfWeek.js.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { imp } from './helpers.mjs';

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-votes-'));
const file = path.join(dir, 'old.db');
try {
  // an old database: the old votes table with a vote in it
  const old = new DatabaseSync(file);
  old.exec("CREATE TABLE accounts (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, pass_salt TEXT NOT NULL, pass_hash TEXT NOT NULL, gold INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL); INSERT INTO accounts (username, pass_salt, pass_hash, created_at) VALUES ('old', 's', 'h', 0);");
  old.exec('CREATE TABLE plots (id INTEGER PRIMARY KEY, district TEXT NOT NULL, building_type TEXT, owner_account INTEGER, owner_name TEXT, title TEXT NOT NULL, website TEXT, variant TEXT, logo TEXT, description TEXT, value INTEGER NOT NULL, base_visits INTEGER NOT NULL DEFAULT 0, takeovers INTEGER NOT NULL DEFAULT 0, claimable INTEGER NOT NULL DEFAULT 1, facts TEXT NOT NULL, updated_at INTEGER NOT NULL); INSERT INTO plots (id, district, title, value, facts, updated_at) VALUES (5, \'d\', \'Shop\', 1, \'{}\', 0);');
  old.exec("CREATE TABLE votes (week TEXT NOT NULL, account_id INTEGER NOT NULL REFERENCES accounts(id), plot_id INTEGER NOT NULL REFERENCES plots(id), at INTEGER NOT NULL, PRIMARY KEY (week, account_id)); INSERT INTO votes VALUES ('2026-10-12', 1, 5, 123);");
  old.close();
  const { openDb } = await import(new URL('../services/api/db.mjs', import.meta.url).href);
  const db = openDb(file);
  const key = db.prepare('PRAGMA table_info(votes)').all().filter((c) => c.pk > 0).map((c) => c.name).join();
  check('the old votes table is rebuilt with the new key', key === 'week,account_id,plot_id', key);
  check('keeping the vote that was there', JSON.stringify(db.prepare('SELECT * FROM votes').all()) === JSON.stringify([{ week: '2026-10-12', account_id: 1, plot_id: 5, at: 123 }]));
  db.prepare("INSERT INTO plots (id, district, title, value, facts, updated_at) VALUES (6, 'd', 'Cafe', 1, '{}', 0)").run();
  db.prepare("INSERT INTO votes VALUES ('2026-10-12', 1, 6, 124)").run();
  check('a second vote the same week (another building) now fits', db.prepare('SELECT COUNT(*) AS n FROM votes').get().n === 2);
  db.close();
  const again = openDb(file);
  check('opening it again changes nothing', again.prepare('SELECT COUNT(*) AS n FROM votes').get().n === 2);
  again.close();

  // the shared rules
  const r = await imp('game/buildingOfWeek.js');
  check('one vote a week, two with the stars', r.votesAllowed(false) === 1 && r.votesAllowed(true) === 2);
  const shop = { id: 1, owner: 'A', buildingType: 'shop', districtId: 'saas' };
  check('who can take a vote', r.votable(shop) && !r.votable({ ...shop, buildingType: 'house' }) && !r.votable({ ...shop, admin: true }) && !r.votable({ ...shop, owner: null }) && !r.votable({ ...shop, districtId: 'suburb' }));
  check('why a vote is refused', r.voteProblem(shop, { left: 1 }) === null && /own/.test(r.voteProblem(shop, { left: 1, ownPlot: true })) && /already/.test(r.voteProblem(shop, { left: 1, votedFor: [1] })) && /used/.test(r.voteProblem(shop, { left: 0 })));
  const { generateCity } = await imp('city/cityGenerator.js');
  const plots = generateCity(20260101).plots;
  const week = r.weekStartOf();
  const a = r.simulatedTally(plots, week);
  check('the demo votes are steady for a week and only for businesses', JSON.stringify(a) === JSON.stringify(r.simulatedTally(plots, week)) && a.length >= 5 && a.every((t) => r.votable(plots.find((p) => p.id === t.plotId))) && a.every((t, i) => !i || t.votes <= a[i - 1].votes), JSON.stringify(a.slice(0, 3)));
  check('another week gives other demo votes', JSON.stringify(a) !== JSON.stringify(r.simulatedTally(plots, r.addWeeks(week, -1))));
  const mine = r.withLocalVotes(a, plots, [a[a.length - 1].plotId]);
  check('your own demo votes are added to the tally', mine.find((t) => t.plotId === a[a.length - 1].plotId).votes === a[a.length - 1].votes + 1);
  check('voting closes at the start of next week', r.votingClosesAt(week) === r.weekWindow(r.addWeeks(week, 1)).start);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(fails ? `${fails} failed` : 'ALL OK');
process.exit(fails ? 1 : 0);
