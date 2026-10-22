"""The parts of the messaging domain the cross-service contract test cannot reach: retention, the notice outbox when the presence
server is down, and an inquiry racing a take-over. The Node API is replaced by a small fake."""
import json
import unittest

from app.config import Settings
from app.db import open_db
from app.domain import DAY, Messaging, now
from app.errors import Fail


class FakeNode:
    def __init__(self):
        self.accounts_by_id = {1: {'id': 1, 'username': 'amy', 'banned': False, 'emailVerified': True}, 2: {'id': 2, 'username': 'bob', 'banned': False, 'emailVerified': True}}
        self.owners = [{'plotId': 7, 'title': 'Amy Bakery', 'ownerAccount': 1, 'version': 10}]
        self.notified = []
        self.presence_up = True

    async def accounts(self, ids=(), username=None):
        found = [self.accounts_by_id[i] for i in ids if i in self.accounts_by_id]
        return found + [a for a in self.accounts_by_id.values() if username and a['username'] == username]

    async def owner(self, plot_id):
        return self.owners.pop(0) if len(self.owners) > 1 else self.owners[0]  # each call can see a different owner

    async def notify(self, events):
        if self.presence_up:
            self.notified.extend(events)
        return self.presence_up

    async def screen(self, text):
        return None

    async def binding(self, binding):
        return self.accounts_by_id.get(int(binding)) if str(binding).isdigit() else None

    async def ban(self, account_id, reason):
        self.accounts_by_id[account_id]['banned'] = True


class Case(unittest.IsolatedAsyncioTestCase):
    def make(self, env=None):
        cfg = Settings({'MESSAGING_DB': ':memory:', 'MP_NOTIFY_URL': 'http://presence.test/notify', **(env or {})})
        node = FakeNode()
        m = Messaging(open_db(':memory:'), cfg, node)
        self.addCleanup(m.db.close)
        return m, node


class Retention(Case):
    def test_old_lines_and_messages_are_wiped_but_reported_ones_kept(self):
        m, _ = self.make()
        week = now() - 10 * DAY
        old = now() - 100 * DAY
        n1 = m.db.execute("INSERT INTO nearby_messages (sender, room, body, recipients, at) VALUES (1, 'r', 'old line', '[2]', ?)", (week,)).lastrowid
        n2 = m.db.execute("INSERT INTO nearby_messages (sender, room, body, recipients, at) VALUES (1, 'r', 'reported line', '[2]', ?)", (week,)).lastrowid
        m.db.execute("INSERT INTO messaging_reports (kind, target_id, reporter, reason, created_at) VALUES ('nearby', ?, 2, 'spam', ?)", (str(n2), week))
        m.db.execute("INSERT INTO conversations (id, kind, created_by, created_at, last_at) VALUES ('conv-old', 'direct', 1, ?, ?)", (old, old))
        m.db.execute("INSERT INTO messages (conversation_id, sender, client_id, body, at) VALUES ('conv-old', 1, 'old-message', 'ancient', ?)", (old,))
        out = m.prune()
        self.assertEqual((out['nearby'], out['inbox']), (1, 1))
        self.assertIsNone(m.db.execute('SELECT body FROM nearby_messages WHERE id = ?', (n1,)).fetchone()['body'])
        self.assertEqual(m.db.execute('SELECT body FROM nearby_messages WHERE id = ?', (n2,)).fetchone()['body'], 'reported line')


class Outbox(Case):
    async def test_a_notice_the_presence_server_missed_is_retried_later(self):
        m, node = self.make()
        m.enqueue([1, 2], {'type': 'inbox.changed', 'conversationId': 'c'})
        node.presence_up = False
        await m.deliver_notices()
        rows = m.db.execute('SELECT status, attempts, next_at FROM messaging_outbox').fetchall()
        self.assertTrue(all(r['status'] == 'pending' and r['attempts'] == 1 and r['next_at'] > now() for r in rows))
        node.presence_up = True
        m.db.execute('UPDATE messaging_outbox SET next_at = 0')
        await m.deliver_notices()
        self.assertEqual(m.outbox_counts(), {'sent': 2})
        self.assertEqual(sorted(e['account'] for e in node.notified), [1, 2])
        self.assertTrue(all('text' not in e['event'] and e['event']['eventId'] for e in node.notified))

    async def test_after_eight_failures_a_notice_is_dead_not_retried_forever(self):
        m, node = self.make()
        node.presence_up = False
        m.enqueue([1], {'type': 'inbox.changed', 'conversationId': 'c'})
        for _ in range(8):
            m.db.execute('UPDATE messaging_outbox SET next_at = 0')
            await m.deliver_notices()
        self.assertEqual(m.outbox_counts(), {'dead': 1})


class InquiryRace(Case):
    async def test_an_inquiry_is_refused_if_the_building_changes_hands_while_it_is_checked(self):
        m, node = self.make()
        node.owners = [{'plotId': 7, 'title': 'Amy Bakery', 'ownerAccount': 1, 'version': 10}, {'plotId': 7, 'title': 'Bob Bakery', 'ownerAccount': 2, 'version': 11}]
        cat = {'id': 3, 'username': 'cat', 'emailVerified': True}
        with self.assertRaises(Fail) as e:
            await m.start_inquiry(cat, 7, {'text': 'Still open?', 'clientMessageId': 'client-0001'})
        self.assertEqual(e.exception.code, 'owner_changed')
        self.assertEqual(m.db.execute('SELECT COUNT(*) AS n FROM conversations').fetchone()['n'], 0)

    async def test_otherwise_it_records_the_owner_and_version_it_was_sent_to(self):
        m, node = self.make()
        cat = {'id': 3, 'username': 'cat', 'emailVerified': True}
        out = await m.start_inquiry(cat, 7, {'text': 'Still open?', 'clientMessageId': 'client-0002'})
        row = m.db.execute('SELECT owner_account, owner_version, plot_title FROM conversations WHERE id = ?', (out['conversation']['id'],)).fetchone()
        self.assertEqual(tuple(row), (1, 10, 'Amy Bakery'))
        self.assertEqual(json.loads(m.db.execute('SELECT event FROM messaging_outbox LIMIT 1').fetchone()['event'])['type'], 'inbox.changed')


class Privacy(Case):
    """The export and the erasure the Node API asks for (services/api/privacy.mjs), as messaging.mjs exportFor / eraseFor."""

    def seed(self, m):
        m.remember([{'id': 1, 'username': 'amy'}, {'id': 2, 'username': 'bob'}])
        m.db.execute("INSERT INTO conversations (id, kind, pair_key, created_by, created_at, last_at) VALUES ('conv-ab', 'direct', '1:2', 1, 1, 3)")
        m.db.execute("INSERT INTO conversation_members (conversation_id, account_id, status) VALUES ('conv-ab', 1, 'accepted'), ('conv-ab', 2, 'accepted')")
        m.db.execute("INSERT INTO messages (conversation_id, sender, client_id, body, at) VALUES ('conv-ab', 1, 'amy-00001', 'hello bob', 1), ('conv-ab', 2, 'bob-00001', 'hi amy', 2)")
        reported = m.db.execute("INSERT INTO messages (conversation_id, sender, client_id, body, at) VALUES ('conv-ab', 1, 'amy-00002', 'rude words', 3)").lastrowid
        m.db.execute("INSERT INTO messaging_reports (kind, target_id, reporter, reason, evidence, created_at) VALUES ('message', ?, 2, 'offensive', ?, 4)", (str(reported), json.dumps({'sender': 1, 'senderName': 'amy', 'text': 'rude words'})))
        m.db.execute("INSERT INTO nearby_messages (sender, room, body, recipients, at) VALUES (1, 'r', 'nearby hi', '[2]', 5), (2, 'r', 'bob nearby', '[1]', 6)")
        m.db.execute('INSERT INTO account_blocks (blocker, blocked, at) VALUES (1, 2, 7)')
        m.db.execute("INSERT INTO messaging_settings (account_id, requests) VALUES (1, 0)")
        m.enqueue([1], {'type': 'inbox.changed', 'conversationId': 'conv-ab'})

    def test_the_export_has_both_sides_of_a_conversation_but_no_other_account_number(self):
        m, _ = self.make()
        self.seed(m)
        out = m.export_for(1)
        self.assertEqual(out['requests'], False)
        self.assertEqual(out['blocks'][0]['username'], 'bob')
        conv = out['conversations'][0]
        self.assertEqual(conv['with'], ['bob'])
        self.assertEqual([(x['mine'], x['from'], x['text']) for x in conv['messages']], [(True, 'amy', 'hello bob'), (False, 'bob', 'hi amy'), (True, 'amy', 'rude words')])
        self.assertEqual([n['text'] for n in out['nearby']], ['nearby hi'])
        self.assertNotIn('"id": 2', json.dumps(out))

    def test_erasing_wipes_its_words_but_keeps_reported_evidence_and_the_other_side(self):
        m, _ = self.make()
        self.seed(m)
        out = m.erase_for(1, 'deleted-1')
        self.assertEqual((out['messages'], out['nearby'], out['blocks'], out['notices']), (1, 1, 1, 1))
        bodies = {r['client_id']: r['body'] for r in m.db.execute('SELECT client_id, body FROM messages').fetchall()}
        self.assertEqual(bodies, {'amy-00001': None, 'bob-00001': 'hi amy', 'amy-00002': 'rude words'})  # the reported one waits for the decision
        self.assertEqual(m.username(1), 'deleted-1')
        self.assertEqual(json.loads(m.db.execute('SELECT evidence FROM messaging_reports').fetchone()['evidence'])['senderName'], 'deleted-1')
        self.assertEqual(m.db.execute("SELECT status FROM conversation_members WHERE account_id = 1").fetchone()['status'], 'declined')
        self.assertIsNone(m.db.execute('SELECT 1 FROM messaging_settings WHERE account_id = 1').fetchone())


if __name__ == '__main__':
    unittest.main()
