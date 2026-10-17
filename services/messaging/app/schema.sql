-- The messaging service's own database (docs/architecture/node_fastapi_architecture_plan.md). Account and plot ids are the Node API's: they are
-- references, not foreign keys (that database is not this one). Same tables and meanings as the messaging tables the Node API had,
-- so data moves across with its ids (app/migrate_from_node.py).
CREATE TABLE IF NOT EXISTS nearby_messages (
  id INTEGER PRIMARY KEY,                        -- sent to clients as "n<id>"
  sender INTEGER NOT NULL,
  room TEXT NOT NULL,
  body TEXT,                                     -- NULL once removed or expired
  recipients TEXT NOT NULL,                      -- JSON: the account ids it was delivered to (at most 200)
  state TEXT NOT NULL DEFAULT 'ok',              -- ok | removed | expired
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS nearby_messages_at ON nearby_messages(at);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                            -- direct | business_inquiry
  pair_key TEXT UNIQUE,                          -- direct only: "<lower account id>:<higher>"
  plot_id INTEGER,                               -- business_inquiry: the building, its name, its owner and the ownership version when made
  plot_title TEXT,
  owner_account INTEGER,
  owner_version INTEGER,
  created_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_message_id INTEGER NOT NULL DEFAULT 0,
  last_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS conversations_inquiry ON conversations(created_by, plot_id, owner_account);
CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  account_id INTEGER NOT NULL,
  status TEXT NOT NULL,                          -- accepted | pending | declined
  muted INTEGER NOT NULL DEFAULT 0,
  last_read INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id, account_id)
);
CREATE INDEX IF NOT EXISTS conversation_members_account ON conversation_members(account_id, status);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  sender INTEGER NOT NULL,
  client_id TEXT NOT NULL,
  body TEXT,
  state TEXT NOT NULL DEFAULT 'ok',              -- ok | removed | expired
  at INTEGER NOT NULL,
  UNIQUE (sender, client_id)
);
CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id, id);
CREATE INDEX IF NOT EXISTS messages_sender ON messages(sender, at);
CREATE INDEX IF NOT EXISTS messages_at ON messages(at);
CREATE TABLE IF NOT EXISTS account_blocks (
  blocker INTEGER NOT NULL,
  blocked INTEGER NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (blocker, blocked)
);
CREATE INDEX IF NOT EXISTS account_blocks_blocked ON account_blocks(blocked);
CREATE TABLE IF NOT EXISTS messaging_settings (
  account_id INTEGER PRIMARY KEY,
  requests INTEGER NOT NULL DEFAULT 1            -- 0: nobody new can send this account a message request
);
-- The names of the accounts this service has seen, from the Node API (it stays the authority; a name is only shown from here).
CREATE TABLE IF NOT EXISTS known_accounts (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messaging_reports (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,                            -- message | nearby
  target_id TEXT NOT NULL,
  reporter INTEGER NOT NULL,
  reason TEXT NOT NULL,
  note TEXT,
  evidence TEXT,                                 -- JSON: the message as the server kept it when reported
  status TEXT NOT NULL DEFAULT 'open',
  action TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  UNIQUE (kind, target_id, reporter)
);
CREATE TABLE IF NOT EXISTS messaging_outbox (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL,
  event TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',        -- pending | sent | dead
  attempts INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messaging_outbox_due ON messaging_outbox(status, next_at);
