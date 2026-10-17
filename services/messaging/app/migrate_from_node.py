"""Copies the messaging data out of the Node API's database into this service's (docs/architecture/node_fastapi_architecture_plan.md, step 4).

    python -m app.migrate_from_node --node-db services/api/data/voxelventure.db --messaging-db services/messaging/data/messaging.db

Run it on a backup copy while messaging writes are paused (the Node API with MESSAGING_INBOX=0 and MESSAGING_NEARBY=0, or stopped).
It keeps every id, so read positions, retries (clientMessageId), pages and report references still line up; it refuses to write into a
messaging database that already has messages; and it checks the copy against the source (counts, id ranges, read positions) and
exits with an error if anything does not reconcile. Tickets are not copied: they last a minute and stay with the Node API.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

from .db import open_db, transaction

COPIES = {
    # target table: (source query, target columns)
    'conversations': ('SELECT id, kind, pair_key, plot_id, plot_title, owner_account, NULL AS owner_version, created_by, created_at, last_message_id, last_at FROM conversations', 'id, kind, pair_key, plot_id, plot_title, owner_account, owner_version, created_by, created_at, last_message_id, last_at'),
    'conversation_members': ('SELECT conversation_id, account_id, status, muted, last_read FROM conversation_members', 'conversation_id, account_id, status, muted, last_read'),
    'messages': ('SELECT id, conversation_id, sender, client_id, body, state, at FROM messages', 'id, conversation_id, sender, client_id, body, state, at'),
    'account_blocks': ('SELECT blocker, blocked, at FROM account_blocks', 'blocker, blocked, at'),
    'nearby_messages': ('SELECT id, sender, room, body, recipients, state, at FROM nearby_messages', 'id, sender, room, body, recipients, state, at'),
    'messaging_outbox': ("SELECT id, account_id, event, status, attempts, next_at, created_at FROM messaging_outbox WHERE status = 'pending'", 'id, account_id, event, status, attempts, next_at, created_at'),
    'messaging_reports': ("SELECT id, kind, target_id, reporter, reason, note, evidence, status, action, created_at, resolved_at FROM reports WHERE kind IN ('message', 'nearby')", 'id, kind, target_id, reporter, reason, note, evidence, status, action, created_at, resolved_at'),
    'messaging_settings': ('SELECT id AS account_id, dm_requests AS requests FROM accounts WHERE dm_requests = 0', 'account_id, requests'),
    'known_accounts': ("SELECT id, username, CAST(strftime('%s','now') AS INTEGER) * 1000 AS updated_at FROM accounts", 'id, username, updated_at'),
}


def fingerprint(db: sqlite3.Connection, table: str, query: str) -> dict:
    rows = db.execute(query).fetchall()
    out = {'rows': len(rows)}
    keys = rows[0].keys() if rows else []
    if 'id' in keys:
        ids = [r['id'] for r in rows]
        out['ids'] = [min(ids), max(ids)] if ids else None
    if table == 'conversation_members':
        out['read'] = sum(r['last_read'] for r in rows)
        out['statuses'] = sorted(f"{r['conversation_id']}:{r['account_id']}:{r['status']}:{r['muted']}" for r in rows)
    if table == 'messages':
        out['bodies'] = sum(len(r['body'] or '') for r in rows)
    return out


def migrate(node_db: str, messaging_db: str, dry_run: bool = False) -> dict:
    src = sqlite3.connect(f'file:{Path(node_db).resolve().as_posix()}?mode=ro', uri=True)
    src.row_factory = sqlite3.Row
    have = {r['name'] for r in src.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    if 'conversations' not in have:
        raise SystemExit('The Node database has no messaging tables: nothing to move.')
    dst = open_db(':memory:' if dry_run else messaging_db)
    if dst.execute('SELECT COUNT(*) FROM messages').fetchone()[0] or dst.execute('SELECT COUNT(*) FROM conversations').fetchone()[0]:
        raise SystemExit('The messaging database already has conversations: refusing to mix two sets of messages.')
    report = {}
    with transaction(dst):
        for table, (query, columns) in COPIES.items():
            rows = src.execute(query).fetchall()
            marks = ','.join('?' * len(columns.split(',')))
            dst.executemany(f'INSERT INTO {table} ({columns}) VALUES ({marks})', [tuple(r) for r in rows])
            report[table] = len(rows)
    # reconcile: the same rows, ids and read positions on both sides
    problems = []
    for table, (query, columns) in COPIES.items():
        if table == 'known_accounts':
            continue
        a = fingerprint(src, table, query)
        b = fingerprint(dst, table, f'SELECT {columns} FROM {table}')
        if a != b:
            problems.append({'table': table, 'node': a, 'messaging': b})
    src.close()
    dst.close()
    return {'copied': report, 'problems': problems}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    p.add_argument('--node-db', required=True, help='the Node API database (a backup copy)')
    p.add_argument('--messaging-db', required=True, help='the messaging service database to fill')
    p.add_argument('--dry-run', action='store_true', help='copy into memory and check, without writing anything')
    args = p.parse_args(argv)
    out = migrate(args.node_db, args.messaging_db, args.dry_run)
    print(json.dumps(out, indent=1))
    if out['problems']:
        print('The copy does not match the source. Do not switch over.', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
