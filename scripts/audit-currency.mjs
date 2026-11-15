// Checks that every wallet equals its ledger (docs/architecture/backend.md, "Currency"). It only reads (SELECTs): SQLite needs a normal handle to read a database in WAL mode.
//
//   node scripts/audit-currency.mjs [path-to-the-database]      (default: API_DB, or services/api/data/voxelventure.db)
//
// Prints each mismatch and exits 1 when there is one (so a cron job or the deploy can stop on it), 0 when every account's Gold and Credits equal the sum of their ledgers.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { auditCurrency } from '../services/api/gold.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || process.env.API_DB || path.join(here, '..', 'services', 'api', 'data', 'voxelventure.db');
const db = new DatabaseSync(file);
const audit = auditCurrency(db);
db.close();
console.log(`${file}: ${audit.accounts} accounts, ${audit.ok ? 'every wallet equals its ledger' : `${audit.mismatches.length} MISMATCH(ES)`}`);
for (const m of audit.mismatches) console.log(`  ${m.account}: ${m.wallet} balance ${m.balance}, ledger ${m.ledger}`);
process.exit(audit.ok ? 0 : 1);
