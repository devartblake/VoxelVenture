"""The messaging domain: a port of server/api/messaging.mjs, the same rules and the same answers.

What differs from the Node version is only where facts come from: accounts, sign-ins, bans and plot owners are the Node API's
(app/node.py), so they are asked for before a transaction starts, never inside one; everything stored here is this service's own.
"""
from __future__ import annotations

import base64
import json
import os
import time

from .db import transaction
from .errors import Fail
from .textcheck import check_text, clean_message, word_list

NEARBY_MAX = 140
INBOX_MAX = 1000
MAX_RECIPIENTS = 200
PAGE = 50
DAY = 86400000
CATEGORIES = ['spam', 'offensive', 'misleading', 'other']
MAX_SAFE = 2**53 - 1


def now() -> int:
    return int(time.time() * 1000)


def not_allowed():
    raise Fail(403, 'This message cannot be sent.', 'not_allowed')


def not_found():
    raise Fail(404, 'No such conversation.', 'not_found')


def rate_limited(message: str, retry_after_ms: float):
    raise Fail(429, message, 'rate_limited', retry_after_ms)


def off():
    raise Fail(503, 'Messages are switched off for now.', 'unavailable')


def require_account(account):
    if not account:
        raise Fail(401, 'Sign in first.', 'unauthorized')
    return account


def _int(v, default=0):
    try:
        return int(v)
    except (TypeError, ValueError):
        try:
            return int(float(v))
        except (TypeError, ValueError):
            return default


def _clean_client_id(v) -> str:
    import re
    if isinstance(v, str) and re.fullmatch(r'[\w-]{8,64}', v, re.ASCII):
        return v
    raise Fail(400, 'Each message needs its own id (8 to 64 letters, digits, - or _).', 'bad_client_id')


class Messaging:
    def __init__(self, db, cfg, node):
        self.db = db
        self.cfg = cfg
        self.node = node
        self.nearby_budget: dict[int, list[int]] = {}
        self.words = word_list(cfg.words_file)
        self.delivering = False

    # ---- accounts (the Node API's; names remembered for showing) ---------------------------------------------------------------
    def remember(self, accounts):
        t = now()
        for a in accounts:
            self.db.execute('INSERT INTO known_accounts (id, username, updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET username = excluded.username, updated_at = excluded.updated_at', (a['id'], a['username'], t))

    def username(self, account_id):
        row = self.db.execute('SELECT username FROM known_accounts WHERE id = ?', (account_id,)).fetchone()
        return row['username'] if row else None

    async def lookup(self, account_id=None, username=None):
        if account_id is not None and str(account_id).lstrip('-').isdigit():
            found = await self.node.accounts([int(account_id)])
        elif isinstance(username, str) and username.strip():
            found = await self.node.accounts([], username.strip()[:20])
        else:
            return None
        self.remember(found)
        return found[0] if found else None

    def requests_allowed(self, account_id) -> bool:
        row = self.db.execute('SELECT requests FROM messaging_settings WHERE account_id = ?', (account_id,)).fetchone()
        return bool(row['requests']) if row else True

    # ---- blocks ---------------------------------------------------------------------------------------------------------------
    def blocked_among(self, me, others) -> set:
        ids = sorted({_int(n) for n in others if _int(n) > 0 and _int(n) != me})
        if not ids:
            return set()
        q = ','.join('?' * len(ids))
        rows = self.db.execute(f'SELECT blocked AS other FROM account_blocks WHERE blocker = ? AND blocked IN ({q}) UNION SELECT blocker AS other FROM account_blocks WHERE blocked = ? AND blocker IN ({q})', (me, *ids, me, *ids)).fetchall()
        return {r['other'] for r in rows}

    def is_blocked(self, a, b) -> bool:
        return bool(self.blocked_among(a, [b]))

    async def block(self, account, body):
        require_account(account)
        other = await self.lookup(body.get('accountId'), body.get('username'))
        if not other:
            raise Fail(404, 'No such player.', 'no_account')
        if other['id'] == account['id']:
            raise Fail(400, 'You cannot block yourself.', 'self')
        self.db.execute('INSERT OR IGNORE INTO account_blocks (blocker, blocked, at) VALUES (?,?,?)', (account['id'], other['id'], now()))
        return {'blocked': {'id': other['id'], 'username': other['username']}}

    def unblock(self, account, other_id):
        require_account(account)
        self.db.execute('DELETE FROM account_blocks WHERE blocker = ? AND blocked = ?', (account['id'], _int(other_id)))
        return {'ok': True}

    def get_settings(self, account):
        require_account(account)
        blocks = self.db.execute('SELECT b.blocked AS id, k.username, b.at FROM account_blocks b LEFT JOIN known_accounts k ON k.id = b.blocked WHERE b.blocker = ? ORDER BY b.at DESC', (account['id'],)).fetchall()
        return {'requests': self.requests_allowed(account['id']), 'blocks': [dict(r) for r in blocks]}

    def set_settings(self, account, body):
        require_account(account)
        if isinstance(body.get('requests'), bool):
            self.db.execute('INSERT INTO messaging_settings (account_id, requests) VALUES (?,?) ON CONFLICT(account_id) DO UPDATE SET requests = excluded.requests', (account['id'], 1 if body['requests'] else 0))
        return self.get_settings(account)

    # ---- nearby -----------------------------------------------------------------------------------------------------------------
    async def accept_nearby(self, body):
        """The presence server asks before passing on a signed-in player's line: who said it (from the binding, asked of the Node API
        each time), whether it may be said, and which of the players in range may hear it. Kept a few days as evidence for reports."""
        if not self.cfg.nearby:
            off()
        who = await self.node.binding(body.get('binding'))
        if not who:
            raise Fail(401, 'Sign in again to chat.', 'unauthenticated')
        self.remember([who])
        said = clean_message(body.get('text'), NEARBY_MAX)
        if not said:
            raise Fail(400, 'Write something first.', 'empty')
        ok, reason = check_text(said, links=0, words=self.words)
        if not ok:
            raise Fail(422, reason, 'content_rejected')
        await self.node.screen(said)
        t = now()
        recent = [x for x in self.nearby_budget.get(who['id'], []) if t - x < 60000]
        if len(recent) >= self.cfg.nearby_per_minute:
            rate_limited('You are chatting very fast. Wait a moment.', 60000 - (t - recent[0]))
        recent.append(t)
        self.nearby_budget[who['id']] = recent
        raw = body.get('recipients') if isinstance(body.get('recipients'), list) else []
        candidates = [n for n in (_int(x) for x in raw[:MAX_RECIPIENTS]) if n > 0]
        blocked = self.blocked_among(who['id'], candidates)
        deliver_to = list(dict.fromkeys(n for n in candidates if n not in blocked))
        cur = self.db.execute('INSERT INTO nearby_messages (sender, room, body, recipients, at) VALUES (?,?,?,?,?)', (who['id'], str(body.get('room') or '')[:40], said, json.dumps(deliver_to), t))
        return {'messageId': f'n{cur.lastrowid}', 'text': said, 'at': t, 'accountId': who['id'], 'username': who['username'], 'blocked': sorted(blocked)}

    def forget_quiet_budgets(self):
        t = now()
        for k in [k for k, v in self.nearby_budget.items() if not any(t - x < 60000 for x in v)]:
            del self.nearby_budget[k]

    # ---- the inbox --------------------------------------------------------------------------------------------------------------
    def member_of(self, conversation_id, account_id):
        return self.db.execute('SELECT * FROM conversation_members WHERE conversation_id = ? AND account_id = ?', (str(conversation_id), account_id)).fetchone()

    def require_member(self, conversation_id, account_id):
        m = self.member_of(conversation_id, account_id)
        if not m:
            not_found()
        return m

    def others_in(self, conversation_id, account_id):
        rows = self.db.execute('SELECT m.*, k.username FROM conversation_members m LEFT JOIN known_accounts k ON k.id = m.account_id WHERE m.conversation_id = ? AND m.account_id != ?', (conversation_id, account_id)).fetchall()
        return [dict(r) for r in rows]

    def conversation_row(self, conversation_id):
        return self.db.execute('SELECT * FROM conversations WHERE id = ?', (str(conversation_id),)).fetchone()

    def message_row(self, where: str, args):
        return self.db.execute(f'SELECT m.*, k.username FROM messages m LEFT JOIN known_accounts k ON k.id = m.sender WHERE {where}', args).fetchone()

    async def clean_body(self, body):
        text = clean_message(body.get('text'), INBOX_MAX, lines=True)
        if not text:
            raise Fail(400, 'Write something first.', 'empty')
        ok, reason = check_text(text, links=1, words=self.words)
        if not ok:
            raise Fail(422, reason, 'content_rejected')
        await self.node.screen(text)
        return text

    @staticmethod
    def message_view(row, me):
        out = {'id': row['id'], 'ref': f"m{row['id']}", 'conversationId': row['conversation_id'], 'sender': {'id': row['sender'], 'username': row['username']}, 'mine': row['sender'] == me, 'text': row['body'] if row['state'] == 'ok' else None, 'state': row['state'], 'at': row['at']}
        if row['sender'] == me:
            out['clientMessageId'] = row['client_id']
        return out

    def conversation_view(self, row, me):
        mine = self.member_of(row['id'], me)
        others = self.others_in(row['id'], me)
        other = others[0] if others else None
        last = self.message_row('m.id = ?', (row['last_message_id'],)) if row['last_message_id'] else None
        unread = self.db.execute('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND id > ? AND sender != ?', (row['id'], mine['last_read'], me)).fetchone()['n']
        sent_by_me = self.db.execute('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND sender = ?', (row['id'], me)).fetchone()['n']
        last_view = None
        if last:
            last_view = self.message_view(last, me)
            last_view['text'] = last['body'][:120] if last['state'] == 'ok' else None
        return {
            'id': row['id'],
            'kind': row['kind'],
            'other': {'id': other['account_id'], 'username': other['username']} if other else None,
            'plot': {'id': row['plot_id'], 'title': row['plot_title'], 'youOwnedIt': row['owner_account'] == me} if row['plot_id'] else None,
            'status': mine['status'],
            'waiting': bool(other and other['status'] != 'accepted' and sent_by_me > 0),
            'muted': bool(mine['muted']),
            'lastRead': mine['last_read'],
            'unread': unread,
            'blocked': self.is_blocked(me, other['account_id']) if other else False,
            'lastAt': row['last_at'],
            'lastMessage': last_view,
        }

    def summary(self, account):
        require_account(account)
        me = account['id']
        unread = self.db.execute("SELECT COUNT(*) AS n FROM conversation_members cm JOIN messages m ON m.conversation_id = cm.conversation_id WHERE cm.account_id = ? AND cm.status = 'accepted' AND m.id > cm.last_read AND m.sender != ?", (me, me)).fetchone()['n']
        requests = self.db.execute("SELECT COUNT(*) AS n FROM conversation_members WHERE account_id = ? AND status = 'pending'", (me,)).fetchone()['n']
        return {'unread': unread, 'requests': requests}

    def list_conversations(self, account, box='inbox', cursor=None, limit=None):
        require_account(account)
        status = 'pending' if box == 'requests' else 'accepted'
        n = max(1, min(PAGE, _int(limit) or 30))
        before = _int(cursor) if _int(cursor) > 0 else MAX_SAFE
        rows = self.db.execute('SELECT c.* FROM conversation_members m JOIN conversations c ON c.id = m.conversation_id WHERE m.account_id = ? AND m.status = ? AND c.last_message_id < ? ORDER BY c.last_message_id DESC LIMIT ?', (account['id'], status, before, n)).fetchall()
        return {'conversations': [self.conversation_view(r, account['id']) for r in rows], 'nextCursor': rows[-1]['last_message_id'] if len(rows) == n else None, **self.summary(account)}

    def get_conversation(self, account, cid):
        require_account(account)
        self.require_member(cid, account['id'])
        return self.conversation_view(self.conversation_row(cid), account['id'])

    def list_messages(self, account, cid, before=None, after=None, limit=None):
        require_account(account)
        self.require_member(cid, account['id'])
        if before is not None and after is not None:
            raise Fail(400, 'Ask for messages before or after one, not both.', 'bad_cursor')
        n = max(1, min(PAGE, _int(limit) or PAGE))
        sel = 'SELECT m.*, k.username FROM messages m LEFT JOIN known_accounts k ON k.id = m.sender WHERE m.conversation_id = ?'
        if after is not None:
            rows = self.db.execute(f'{sel} AND m.id > ? ORDER BY m.id ASC LIMIT ?', (str(cid), _int(after), n + 1)).fetchall()
        else:
            b = _int(before) if _int(before) > 0 else MAX_SAFE
            rows = list(reversed(self.db.execute(f'{sel} AND m.id < ? ORDER BY m.id DESC LIMIT ?', (str(cid), b, n + 1)).fetchall()))
        more = len(rows) > n
        if more:
            rows = rows[:n] if after is not None else rows[1:]
        return {'messages': [self.message_view(r, account['id']) for r in rows], 'more': more}

    def insert_message(self, cid, sender, client_id, body, members):
        t = now()
        cur = self.db.execute('INSERT INTO messages (conversation_id, sender, client_id, body, at) VALUES (?,?,?,?,?)', (cid, sender, client_id, body, t))
        mid = cur.lastrowid
        self.db.execute('UPDATE conversations SET last_message_id = ?, last_at = ? WHERE id = ?', (mid, t, cid))
        self.db.execute('UPDATE conversation_members SET last_read = ? WHERE conversation_id = ? AND account_id = ?', (mid, cid, sender))
        self.enqueue(members, {'type': 'inbox.changed', 'conversationId': cid})
        return self.message_row('m.id = ?', (mid,))

    def earlier(self, sender, client_id, cid, body):
        row = self.message_row('m.sender = ? AND m.client_id = ?', (sender, client_id))
        if not row:
            return None
        if (cid and row['conversation_id'] != cid) or row['body'] != body:
            raise Fail(409, 'That message id was already used for another message.', 'id_reused')
        return row

    def send_budget(self, sender):
        t = now()
        rows = self.db.execute('SELECT at FROM messages WHERE sender = ? AND at > ? ORDER BY at', (sender, t - 60000)).fetchall()
        if len(rows) >= self.cfg.sends_per_minute:
            rate_limited('You are sending messages very fast. Wait a moment.', 60000 - (t - rows[0]['at']))

    def new_contact_budget(self, account):
        if account.get('emailVerified'):
            return
        n = self.db.execute('SELECT COUNT(*) AS n FROM conversations WHERE created_by = ? AND created_at > ?', (account['id'], now() - DAY)).fetchone()['n']
        if n >= self.cfg.new_per_day:
            rate_limited(f'You can start {self.cfg.new_per_day} new conversations a day until you confirm your email (Account).', DAY)

    async def send_message(self, account, cid, body):
        require_account(account)
        if not self.cfg.inbox:
            off()
        cid = str(cid)
        client_id = _clean_client_id(body.get('clientMessageId'))
        text = await self.clean_body(body)
        self.require_member(cid, account['id'])
        others = self.others_in(cid, account['id'])
        fresh = {a['id']: a for a in await self.node.accounts([o['account_id'] for o in others])}  # bans are the Node API's
        self.remember(fresh.values())
        with transaction(self.db):
            mine = self.require_member(cid, account['id'])
            again = self.earlier(account['id'], client_id, cid, text)
            if again:
                return {'message': self.message_view(again, account['id']), 'duplicate': True}
            others = self.others_in(cid, account['id'])
            if any(fresh.get(o['account_id'], {}).get('banned', True) or self.is_blocked(account['id'], o['account_id']) for o in others):
                not_allowed()
            if any(o['status'] == 'declined' for o in others):
                not_allowed()
            if any(o['status'] == 'pending' for o in others) and self.db.execute('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND sender = ?', (cid, account['id'])).fetchone()['n'] > 0:
                raise Fail(409, 'They have not accepted your message yet. You can send more once they do.', 'request_pending')
            self.send_budget(account['id'])
            if mine['status'] != 'accepted':
                self.db.execute("UPDATE conversation_members SET status = 'accepted' WHERE conversation_id = ? AND account_id = ?", (cid, account['id']))
            row = self.insert_message(cid, account['id'], client_id, text, [account['id'], *[o['account_id'] for o in others]])
            return {'message': self.message_view(row, account['id']), 'duplicate': False}

    async def start_direct(self, account, body):
        require_account(account)
        if not self.cfg.inbox:
            off()
        client_id = _clean_client_id(body.get('clientMessageId'))
        text = await self.clean_body(body)
        to = await self.lookup(body.get('accountId'), body.get('username'))
        if to and to['id'] == account['id']:
            raise Fail(400, 'That is you.', 'self')
        if not to or to['banned']:
            not_allowed()
        key = ':'.join(str(x) for x in sorted([account['id'], to['id']]))
        existing = self.db.execute('SELECT id FROM conversations WHERE pair_key = ?', (key,)).fetchone()
        if existing:
            out = await self.send_message(account, existing['id'], {'text': text, 'clientMessageId': client_id})
            return {'conversation': self.get_conversation(account, existing['id']), **out}
        with transaction(self.db):
            again = self.earlier(account['id'], client_id, None, text)
            if again:
                return {'conversation': self.conversation_view(self.conversation_row(again['conversation_id']), account['id']), 'message': self.message_view(again, account['id']), 'duplicate': True}
            if self.is_blocked(account['id'], to['id']) or not self.requests_allowed(to['id']):
                not_allowed()
            self.new_contact_budget(account)
            self.send_budget(account['id'])
            cid = base64.urlsafe_b64encode(os.urandom(12)).decode().rstrip('=')
            t = now()
            self.db.execute("INSERT INTO conversations (id, kind, pair_key, created_by, created_at, last_at) VALUES (?, 'direct', ?, ?, ?, ?)", (cid, key, account['id'], t, t))
            self.db.execute("INSERT INTO conversation_members (conversation_id, account_id, status) VALUES (?, ?, 'accepted'), (?, ?, 'pending')", (cid, account['id'], cid, to['id']))
            row = self.insert_message(cid, account['id'], client_id, text, [account['id'], to['id']])
            return {'conversation': self.conversation_view(self.conversation_row(cid), account['id']), 'message': self.message_view(row, account['id']), 'duplicate': False}

    async def start_inquiry(self, account, plot_id, body):
        """A message to whoever owns a building now. The owner comes from the Node API with a version; it is asked again right before
        saving, and if the building changed hands in between the inquiry is refused (try again), so it never goes to an old owner."""
        require_account(account)
        if not self.cfg.inbox or not self.cfg.inquiries:
            off()
        client_id = _clean_client_id(body.get('clientMessageId'))
        text = await self.clean_body(body)
        owner = await self.node.owner(plot_id)
        if not owner.get('ownerAccount'):
            raise Fail(409, 'Nobody owns this building, so there is nobody to message.', 'no_owner')
        if owner['ownerAccount'] == account['id']:
            raise Fail(400, 'This is your own building.', 'self')
        to = await self.lookup(owner['ownerAccount'])
        again_owner = await self.node.owner(plot_id)  # the last look before writing
        if again_owner.get('version') != owner.get('version') or again_owner.get('ownerAccount') != owner['ownerAccount']:
            raise Fail(409, 'This building just changed hands. Try again.', 'owner_changed')
        pid = owner['plotId']
        with transaction(self.db):
            again = self.earlier(account['id'], client_id, None, text)
            if again:
                return {'conversation': self.conversation_view(self.conversation_row(again['conversation_id']), account['id']), 'message': self.message_view(again, account['id']), 'duplicate': True}
            if not to or to['banned'] or self.is_blocked(account['id'], to['id']):
                not_allowed()
            thread = self.db.execute("SELECT c.id FROM conversations c JOIN conversation_members m ON m.conversation_id = c.id AND m.account_id = ? WHERE c.kind = 'business_inquiry' AND c.created_by = ? AND c.plot_id = ? AND c.owner_account = ?", (to['id'], account['id'], pid, to['id'])).fetchone()
            if thread:
                cid = thread['id']
                them = self.member_of(cid, to['id'])
                if them['status'] == 'declined':
                    not_allowed()
                if them['status'] == 'pending':
                    raise Fail(409, 'The owner has not answered your last message yet.', 'request_pending')
                if self.member_of(cid, account['id'])['status'] != 'accepted':
                    self.db.execute("UPDATE conversation_members SET status = 'accepted' WHERE conversation_id = ? AND account_id = ?", (cid, account['id']))
            else:
                self.new_contact_budget(account)
                cid = base64.urlsafe_b64encode(os.urandom(12)).decode().rstrip('=')
                t = now()
                self.db.execute("INSERT INTO conversations (id, kind, plot_id, plot_title, owner_account, owner_version, created_by, created_at, last_at) VALUES (?, 'business_inquiry', ?, ?, ?, ?, ?, ?, ?)", (cid, pid, owner['title'], to['id'], owner.get('version'), account['id'], t, t))
                self.db.execute("INSERT INTO conversation_members (conversation_id, account_id, status) VALUES (?, ?, 'accepted'), (?, ?, 'pending')", (cid, account['id'], cid, to['id']))
            self.send_budget(account['id'])
            row = self.insert_message(cid, account['id'], client_id, text, [account['id'], to['id']])
            return {'conversation': self.conversation_view(self.conversation_row(cid), account['id']), 'message': self.message_view(row, account['id']), 'duplicate': False}

    def respond(self, account, cid, action):
        require_account(account)
        if action not in ('accept', 'decline'):
            raise Fail(400, 'action must be accept or decline.', 'bad_action')
        with transaction(self.db):
            mine = self.require_member(cid, account['id'])
            status = 'accepted' if action == 'accept' else 'declined'
            if mine['status'] != status:
                self.db.execute('UPDATE conversation_members SET status = ? WHERE conversation_id = ? AND account_id = ?', (status, str(cid), account['id']))
                to = [account['id'], *[o['account_id'] for o in self.others_in(str(cid), account['id'])]] if action == 'accept' else [account['id']]
                self.enqueue(to, {'type': 'inbox.changed', 'conversationId': str(cid)})
            return self.get_conversation(account, cid)

    def mark_read(self, account, cid, up_to):
        require_account(account)
        mine = self.require_member(cid, account['id'])
        newest = self.conversation_row(cid)['last_message_id']
        to = min(max(0, _int(up_to)), newest)
        if to > mine['last_read']:
            with transaction(self.db):
                self.db.execute('UPDATE conversation_members SET last_read = ? WHERE conversation_id = ? AND account_id = ? AND last_read < ?', (to, str(cid), account['id'], to))
                self.enqueue([account['id']], {'type': 'inbox.changed', 'conversationId': str(cid)})
        return {'lastRead': max(mine['last_read'], to), **self.summary(account)}

    def set_preferences(self, account, cid, body):
        require_account(account)
        self.require_member(cid, account['id'])
        if isinstance(body.get('muted'), bool):
            self.db.execute('UPDATE conversation_members SET muted = ? WHERE conversation_id = ? AND account_id = ?', (1 if body['muted'] else 0, str(cid), account['id']))
        return self.get_conversation(account, cid)

    # ---- reports ----------------------------------------------------------------------------------------------------------------
    def report_message(self, account, body):
        require_account(account)
        ref = str(body.get('messageId') or '')
        reason = body.get('category') if body.get('category') in CATEGORIES else 'other'
        me = account['id']
        if len(ref) > 1 and ref[0] == 'm' and ref[1:].isdigit():
            kind, mid = 'message', int(ref[1:])
            m = self.message_row('m.id = ?', (mid,))
            if not m or not self.member_of(m['conversation_id'], me):
                raise Fail(404, 'No such message.', 'no_target')
            if m['sender'] == me:
                raise Fail(409, 'You cannot report your own message.', 'own_content')
            evidence = {'conversationId': m['conversation_id'], 'sender': m['sender'], 'senderName': m['username'], 'text': m['body'], 'at': m['at']}
        elif len(ref) > 1 and ref[0] == 'n' and ref[1:].isdigit():
            kind, mid = 'nearby', int(ref[1:])
            m = self.db.execute('SELECT n.*, k.username FROM nearby_messages n LEFT JOIN known_accounts k ON k.id = n.sender WHERE n.id = ?', (mid,)).fetchone()
            if not m or me not in json.loads(m['recipients']):
                raise Fail(404, 'No such message.', 'no_target')
            if m['sender'] == me:
                raise Fail(409, 'You cannot report your own message.', 'own_content')
            evidence = {'room': m['room'], 'sender': m['sender'], 'senderName': m['username'], 'text': m['body'], 'at': m['at']}
        else:
            raise Fail(400, 'messageId must be a server message id.', 'bad_message_id')
        if self.db.execute('SELECT 1 FROM messaging_reports WHERE kind = ? AND target_id = ? AND reporter = ?', (kind, str(mid), me)).fetchone():
            return {'reported': True, 'already': True}
        note = clean_message(body['note'], 200) if isinstance(body.get('note'), str) else ''
        self.db.execute('INSERT INTO messaging_reports (kind, target_id, reporter, reason, note, evidence, created_at) VALUES (?,?,?,?,?,?,?)', (kind, str(mid), me, reason, note or None, json.dumps(evidence), now()))
        return {'reported': True, 'already': False}

    # ---- the moderators' queue (the same shapes as the Node API's /admin/reports) ---------------------------------------------------
    async def queue(self, status='open'):
        rows = self.db.execute('SELECT kind, target_id, COUNT(*) AS n, MIN(id) AS first, GROUP_CONCAT(reason) AS reasons FROM messaging_reports WHERE status = ? GROUP BY kind, target_id ORDER BY n DESC, first', (status,)).fetchall()
        senders = set()
        for r in rows:
            ev = self.db.execute('SELECT evidence FROM messaging_reports WHERE kind = ? AND target_id = ? AND evidence IS NOT NULL ORDER BY id LIMIT 1', (r['kind'], r['target_id'])).fetchone()
            if ev:
                senders.add(json.loads(ev['evidence']).get('sender'))
        banned = {a['id']: a['banned'] for a in await self.node.accounts([s for s in senders if s])} if senders else {}  # bans are the Node API's
        out = []
        for r in rows:
            ev = self.db.execute('SELECT evidence FROM messaging_reports WHERE kind = ? AND target_id = ? AND evidence IS NOT NULL ORDER BY id LIMIT 1', (r['kind'], r['target_id'])).fetchone()
            e = json.loads(ev['evidence']) if ev else None
            seen = []
            for x in str(r['reasons']).split(','):
                if x not in seen:
                    seen.append(x)
            item = {'kind': r['kind'], 'id': r['target_id'], 'reports': r['n'], 'reasons': seen}
            item.update({'text': e.get('text') or '(no text)', 'author': e.get('senderName'), 'authorBanned': bool(banned.get(e.get('sender'))), 'where': f"nearby chat, city {e.get('room')}" if r['kind'] == 'nearby' else 'private message'} if e else {'gone': True})
            out.append(item)
        return out

    def first_report_id(self, kind, target_id):
        row = self.db.execute("SELECT MIN(id) AS id FROM messaging_reports WHERE kind = ? AND target_id = ? AND status = 'open'", (kind, str(target_id))).fetchone()
        if not row or row['id'] is None:
            raise Fail(404, 'No open report on that.', 'no_report')
        return row['id']

    async def resolve(self, report_id, action):
        """dismiss, remove (blank the message for everyone) or ban (remove, and ban the sender: a global ban is the Node API's)."""
        if action not in ('dismiss', 'remove', 'ban'):
            raise Fail(400, 'action must be dismiss, remove or ban.', 'bad_action')
        r = self.db.execute('SELECT * FROM messaging_reports WHERE id = ?', (_int(report_id),)).fetchone()
        if not r:
            raise Fail(404, 'No such report.', 'no_report')
        table = 'messages' if r['kind'] == 'message' else 'nearby_messages'
        sender = self.db.execute(f'SELECT sender FROM {table} WHERE id = ?', (_int(r['target_id']),)).fetchone()
        if action == 'ban' and sender:
            await self.node.ban(sender['sender'], f"reported {r['kind']} {r['target_id']}")
        with transaction(self.db):
            ids = [x['id'] for x in self.db.execute("SELECT id FROM messaging_reports WHERE kind = ? AND target_id = ? AND status = 'open'", (r['kind'], r['target_id'])).fetchall()]
            if action != 'dismiss':
                self.db.execute(f"UPDATE {table} SET body = NULL, state = 'removed' WHERE id = ?", (_int(r['target_id']),))
            for i in ids:
                self.db.execute("UPDATE messaging_reports SET status = 'resolved', action = ?, resolved_at = ? WHERE id = ?", (action, now(), i))
        return {'resolved': len(ids), 'action': action, 'banned': action == 'ban' and bool(sender)}

    # ---- notices for one account (the outbox) -------------------------------------------------------------------------------------
    def enqueue(self, account_ids, event):
        t = now()
        for a in dict.fromkeys(account_ids):
            self.db.execute('INSERT INTO messaging_outbox (account_id, event, next_at, created_at) VALUES (?,?,?,?)', (a, json.dumps(event), t, t))

    async def deliver_notices(self):
        if self.delivering:
            return {'sent': 0}
        self.delivering = True
        try:
            t = now()
            if not self.cfg.notify_url:
                self.db.execute("UPDATE messaging_outbox SET status = 'sent' WHERE status = 'pending'")
                return {'sent': 0}
            rows = self.db.execute("SELECT * FROM messaging_outbox WHERE status = 'pending' AND next_at <= ? ORDER BY id LIMIT 200", (t,)).fetchall()
            if not rows:
                return {'sent': 0}
            ok = await self.node.notify([{'account': r['account_id'], 'event': {**json.loads(r['event']), 'eventId': str(r['id'])}} for r in rows])
            for r in rows:
                if ok:
                    self.db.execute("UPDATE messaging_outbox SET status = 'sent' WHERE id = ?", (r['id'],))
                else:
                    self.db.execute("UPDATE messaging_outbox SET attempts = attempts + 1, next_at = ?, status = CASE WHEN attempts + 1 >= 8 THEN 'dead' ELSE 'pending' END WHERE id = ?", (t + min(60000, 1000 * 2 ** r['attempts']), r['id']))
            return {'sent': len(rows) if ok else 0}
        finally:
            self.delivering = False

    def outbox_counts(self):
        rows = self.db.execute('SELECT status, COUNT(*) AS n FROM messaging_outbox GROUP BY status').fetchall()
        return {r['status']: r['n'] for r in rows}

    # ---- retention ----------------------------------------------------------------------------------------------------------------
    def prune(self, at: int | None = None):
        at = now() if at is None else at
        held = "SELECT target_id FROM messaging_reports WHERE kind = '{}' AND status = 'open'"
        c = self.cfg
        nearby = self.db.execute(f"UPDATE nearby_messages SET body = NULL, state = 'expired' WHERE state = 'ok' AND at < ? AND CAST(id AS TEXT) NOT IN ({held.format('nearby')})", (at - c.nearby_days * DAY,)).rowcount
        self.db.execute("DELETE FROM nearby_messages WHERE at < ? AND CAST(id AS TEXT) NOT IN (SELECT target_id FROM messaging_reports WHERE kind = 'nearby')", (at - (c.nearby_days + 30) * DAY,))
        inbox = self.db.execute(f"UPDATE messages SET body = NULL, state = 'expired' WHERE state = 'ok' AND at < ? AND CAST(id AS TEXT) NOT IN ({held.format('message')})", (at - c.inbox_days * DAY,)).rowcount
        evidence = self.db.execute("UPDATE messaging_reports SET evidence = NULL WHERE evidence IS NOT NULL AND status = 'resolved' AND resolved_at < ?", (at - c.report_days * DAY,)).rowcount
        self.db.execute("DELETE FROM messaging_outbox WHERE status != 'pending' AND created_at < ?", (at - DAY,))
        return {'nearby': nearby, 'inbox': inbox, 'evidence': evidence}
