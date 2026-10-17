# VoxelVenture chat and messaging plan

Date: October 15, 2026
Status: phases 0 to 3 implemented on October 15, 2026, behind switches, with the proposed defaults; phase 4 (launch checks) and the decisions in section 12 are open. See "Implementation status" below.

## Implementation status

Built (verified by `tests/messaging.test.mjs`, about 70 checks across the API and the presence server, and the chat steps of `tests/live-browser.test.mjs` in two real browsers):

| Phase | What is in place | Where |
| --- | --- | --- |
| 0: Foundation | One-use tickets bind a presence connection to an account (redeemed by the presence server with the shared secret; re-checked every 30 s, so sign-out and bans end a binding within a minute); names and the verified mark come from the account; `features` in the welcome; text checks extracted to `server/api/textcheck.mjs`; new tables created on start-up (existing databases upgrade in place); switches `MESSAGING_*`, `MP_CHAT`, `MP_CHAT_GUESTS`; `MP_ORIGINS` allowlist | `server/api/messaging.mjs`, `server/multiplayer.mjs`, `server/api/schema.sql` |
| 1: Nearby | Chat panel (toolbar button with badge); `chat.send` with accepted / rejected answers and Retry on the same id; drafts kept; per-connection and per-account limits; the API screens and keeps a 7-day copy before fan-out (refused, not let through, if it is down); blocks both ways enforced by the server; report, hide (this visit), block, message from a line's menu; cleared on a city change; IME-safe Enter; typing never moves the avatar | `components/ui/chat/`, `lib/state/chatStore.js`, `lib/net/multiplayer.js` |
| 2: Inbox | Conversations, requests (one message until accepted), history with before / after pages, read positions (never backwards), unread counts, mute, request settings, blocks; idempotent sends; account-targeted notices through an outbox written in the same transaction, retried with back-off; polling every 30 s and on focus as the fallback; private state cleared on sign-out and never stored in the browser | same, plus `lib/data/messaging.js` |
| 3: Business inquiries | "Message the owner" on a player-owned building's card; the owner is read inside the transaction; after a take-over the new owner gets new inquiries only | `POST /plots/{id}/inquiries`, `components/ui/PlotCard.jsx` |

Also: reports of chat messages join the existing moderation queue (`npm run moderate`, kinds `message` and `nearby`); retention runs hourly (nearby 7 days, inbox 90, report evidence 180 after a decision, held while a report is open).

Not done yet:
- **Phase 4 launch checks:** a load test with chat traffic on the 600-client benchmark (`scripts/load-test-presence.mjs` has no chat yet), backup and restore of the new tables rehearsed, metrics (accepted / rejected sends, outbox lag, report backlog), and a written rollback run.
- **Phones:** chat was checked at phone size in a headless browser, not on physical devices with their keyboards.
- **Section 7 extras:** timed chat restrictions with reasons, a moderator audit trail for reading reported messages, and rejecting implausible position jumps.
- **Opt-in notification sound** (section 3) and the optional city channel.
- **Several presence servers:** inbox nudges go to the one at `MP_NOTIFY_URL`; players on the others rely on polling.
- **Section 12 decisions** are still yours: sign-in-required public chat (the default with the API), request defaults and limits, retention periods, the intended audience and any age rules, who moderates, person-to-person inquiries (as built) or a staff inbox, and the 140-character Nearby limit.

## Recommendation

Extend the existing nearby chat first, then add account-based direct messaging and business inquiries. Keep chat separate from movement updates so message delivery and history do not affect the simulation. Reuse the Node API, SQLite database, WebSocket presence server, and existing side-panel UI. No new hosted service is necessary for the initial release.

The first release should provide a discoverable Nearby chat with reliable send feedback, verified account identity, mute/block/report controls, and moderation. The second release should add a persistent Inbox with message requests and offline delivery. Business inquiries can follow as a focused extension of the Inbox. City-wide chat should remain optional until moderation and load tests support it.

## 1. What already exists

Verified in the local source during this review:

| Area | Current behavior | Source |
| --- | --- | --- |
| Nearby delivery | Messages reach connections in the same seed-based city within `MP_CHAT_RADIUS`, default 60 units; server limits each connection to one message per second and 140 characters | `server/multiplayer.mjs` |
| Transport | Existing protocol version 2 has a `chat` message with sender connection ID, display name, text, position, and server timestamp | `server/multiplayer.mjs` |
| Client history | Last 40 received messages are held in memory in `useNet.chat` | `lib/net/multiplayer.js` |
| Interface | Online panel contains a nearby-chat log and composer | `components/ui/panel/views.jsx`, `OnlineView` |
| Send feedback gap | `sendChat()` returns true for nonempty text even when no open socket sent it; the UI can clear a draft without confirmed delivery | `lib/net/multiplayer.js` |
| Identity | Presence uses a connection ID and editable name; its hello does not authenticate the API account | `lib/net/multiplayer.js`, `server/multiplayer.mjs` |
| Account foundation | API bearer sessions and account lookup already exist | `server/api/core.mjs`, `server/api/server.mjs` |
| Storage | Node SQLite with WAL, transactions, and existing schema-upgrade helpers | `server/api/db.mjs`, `server/api/schema.sql` |
| Moderation foundation | Text screening, reports, admin review, and account bans exist for other content; chat needs explicit integration | `server/api/moderation.mjs` |

No persistent direct-message inbox, conversation membership, read cursors, or message-request workflow was identified in the reviewed chat path. Existing generic WebSocket rate limits and input cleaning are useful foundations, but do not establish authenticated chat identity or durable delivery.

## 2. Product scope and defaults

| Surface | Purpose | Proposed initial rules |
| --- | --- | --- |
| Nearby | Meet other people around the avatar | Same city and 60-unit radius at send time; retain 140-character limit initially; no replay to newcomers |
| Inbox | Private one-to-one messages | Signed-in accounts only; persistent history; 1,000-character plain-text messages; first contact enters Requests |
| Business inquiry | Contact the current owner from a building card | Sign-in required; creates an account conversation tagged with business context and ownership at creation |
| City channel | Talk across a whole city | Later, opt-in, authenticated, bounded history and stricter rate limits |

Guests can explore and read new nearby messages, but authenticated accounts are required to send in the proposed public release. Label guest and authenticated identities distinctly. Preserve the existing guest-send behavior only behind an explicit trusted-LAN setting.

Exclude voice/video, file uploads, rich HTML, arbitrary embeds, group DMs, trading, payments, message editing, and cross-world public channels from the initial scope. Render messages as plain text; start without clickable external links.

These are recommended defaults rather than user-approved product policies. They do not block planning or implementation behind feature flags.

## 3. User experience

- Add a Chat toolbar entry using the existing movable side panel. Nearby and Inbox become tabs; keep Online focused on players with a clear link into Chat.
- Preserve the open conversation and drafts when switching panels. Clear private state on logout/account change; do not persist private message bodies or drafts to browser storage by default.
- Show sender name, an authenticated identity indicator, timestamp, and pending/sent/failed state. Sent means server accepted; it does not mean a person saw the message.
- Keep Nearby messages scoped to the current city. Clear the visible nearby buffer on city change and explain its ephemeral nature. Do not transfer old messages into a new city.
- Add unread counts, Requests, accept/decline actions, and per-conversation notification mute. Read status advances only when a conversation is visible and its latest messages are displayed.
- Add Message, Mute, Block, and Report actions to appropriate player/message menus. A guest cannot be privately messaged as a stable account.
- Preserve drafts after failures. Offer explicit Retry with the original idempotency key. Do not automatically replay stale Nearby messages after reconnecting or moving cities.
- Enter sends and Shift+Enter inserts a line break in Inbox. Respect IME composition. Opening the composer must stop movement/game shortcuts from processing typed keys.
- Support phone keyboards and safe areas without covering the composer. Keep the player in control of camera/movement focus. Escape closes chat unless another modal owns focus.
- Use accessible labels, keyboard navigation, visible focus, and a polite live region for incoming messages. Avoid announcing full history on every render.
- Notification sound is opt-in and respects existing audio controls. No browser push or email content notifications in the first release.

## 4. Architecture and trust boundaries

### API owns durable messaging

Implement a messaging domain module in `server/api/messaging.mjs`. It owns conversation creation, membership, requests, persistence, blocks, read state, reports, retention, and authorization. Keep writes in short transactions and use cursor pagination.

Use authenticated HTTP for Inbox writes and reads. Commit each message and an outbox notification atomically. The existing API-to-presence notification path can wake clients, but private notifications MUST use a new account-targeted route: never reuse a city-wide world broadcast for message bodies, conversation IDs, or recipient lists.

A private real-time event is a hint to fetch authorized state, not the only copy of a message. If presence is disconnected, Inbox reads and sends still work through the API; poll with backoff and fetch on focus/reconnect. Start with a single authoritative API database; presence nodes must not independently write SQLite files.

### Authenticate presence accounts

Add an authenticated API endpoint issuing a short-lived, single-use messaging ticket after checking the bearer session. Submit the ticket in a WebSocket authentication frame, never in a URL. Presence redeems it through an internal authenticated API endpoint and receives the server-derived account identity and expiry.

Bind connections to accounts server-side; never accept client-supplied account IDs as identity. Validate browser Origin against an allowlist as an additional check. Do not log tickets, bearer tokens, or message contents in diagnostics.

Expire/revalidate bindings and revoke them on logout, account switch, or ban. Define a maximum revocation delay of 60 seconds for public Nearby sending; durable API requests recheck the session on every operation. Authenticated names derive from accounts; display-name changes cannot impersonate another account.

Nearby remains a WebSocket path after authentication. For reportable messages, route acceptance through the API moderation/evidence module before fanout. If that service is unavailable, fail the send explicitly instead of bypassing authorization or moderation.

### Position is a limited trust signal

The server currently receives player positions from clients. Server-side radius filtering prevents accidental cross-room delivery but does not prove physical proximity against a modified client. Document this limitation; clamp positions and reject implausible changes where practical. Do not use chat proximity as proof for rewards or commerce.

## 5. Proposed data model

Add incremental, versioned migrations compatible with existing databases and test upgrade/rollback procedures on a backup.

| Entity | Important fields and rules |
| --- | --- |
| `conversations` | ID, kind (`direct` or `business_inquiry`), created timestamp, optional city/plot context, original owner account; direct conversations have a unique canonical account-pair key |
| `conversation_members` | Conversation/account composite key, request status, notification mute, last-read message sequence; every read and write checks membership and request state |
| `messages` | Server ID/sequence, conversation ID, sender account, client message ID, plain-text body, timestamp, moderation state, deletion timestamp; unique `(sender_account_id, client_message_id)` |
| `account_blocks` | Blocker/blocked composite key and timestamp; enforce both directions when deciding whether a new message can be sent |
| `nearby_message_evidence` | Server message ID, sender, city, body, timestamp, and bounded actual recipient account IDs; short retention, no general history endpoint |
| `messaging_reports` | Reporting account, target message ID, category, evidence snapshot/reference, status, reviewer audit fields; integrate with the existing report queue |
| `messaging_outbox` | Event ID, account recipient, minimal event payload, retry state; worker delivers only to authenticated connections for that account |

Use a server-assigned monotonically ordered message sequence for pagination and read cursors; timestamps are display metadata. Index messages by `(conversation_id, sequence)` and memberships by account. Add idempotency indexes, cleanup indexes, and foreign keys.

Business conversations belong to their participants. A takeover must not give a new owner access to the old owner's conversations. New inquiries resolve the current owner server-side; retain the original business/owner context on existing threads. Recheck ownership transactionally at inquiry creation.

## 6. Proposed API and protocol

Names below are design proposals, not existing endpoints.

| Operation | Suggested endpoint |
| --- | --- |
| Issue/redeem socket ticket | `POST /messaging/ticket`; internal `POST /internal/messaging/redeem` |
| List Inbox/Requests | `GET /conversations?cursor=...&limit=30` |
| Start direct conversation | `POST /conversations` with recipient account ID and first message |
| Start owner inquiry | `POST /plots/:id/inquiries` with first message |
| Read/send messages | `GET /conversations/:id/messages?before=...&after=...&limit=50`; `POST /conversations/:id/messages` |
| Accept/decline request | `POST /conversations/:id/request` |
| Advance read cursor | `POST /conversations/:id/read` |
| Notification mute | `PATCH /conversations/:id/preferences` |
| Block/unblock | `POST /messaging/blocks`; `DELETE /messaging/blocks/:accountId` |
| Report | `POST /messaging/reports` with server message ID and category |

Define `before` and `after` as mutually exclusive, validate cursors against conversation membership, cap all limits server-side, and use a consistent non-disclosing error for unknown and unauthorized conversations.

Negotiate a messaging capability/version while keeping existing presence protocol 2 operational. Add explicit accepted/rejected results to Nearby sending. Use a per-send client ID and server-generated message ID; distinguish sender connection ID from message ID (the current `chat.id` identifies a connection).

Example Nearby send:

```json
{"type":"chat.send","clientMessageId":"random-unique-id","channel":"nearby","text":"Hello!"}
```

Example acceptance:

```json
{"type":"chat.accepted","clientMessageId":"random-unique-id","messageId":"server-id","at":1792100000000}
```

Example private notification, sent only to the relevant account:

```json
{"type":"inbox.changed","eventId":"server-event-id","conversationId":"conversation-id"}
```

Use error codes such as `unauthenticated`, `rate_limited`, `content_rejected`, `unavailable`, and `not_allowed`, with retry information where appropriate. Repeated client IDs return the original result; reject reuse with a different body or conversation. Do not claim exactly-once network delivery: deduplicate at storage and UI boundaries.

Persist before sending success for Inbox messages. Nearby acceptance means validated and accepted for bounded fanout, not durable recipient delivery. Never replay Nearby content through Inbox history.

## 7. Abuse prevention and privacy

- Require sign-in for public sending. Begin with one Nearby send per second plus a rolling account-level budget; rate-limit across tabs/connections as well as by network.
- Proposed starting Inbox limits: 20 sends/minute/account, five new recipients/day for unverified accounts, and one first-contact message until accepted. Make values configurable and tune from legitimate usage.
- One-to-one requests default to enabled; users can turn new requests off. Declined senders cannot repeatedly recreate requests. Use generic refusal responses to avoid exposing block status.
- Blocking prevents new DMs/requests in either direction and filters Nearby delivery server-side. Client filtering gives immediate feedback but is not the enforcement boundary. Existing history remains subject to retention.
- Notification mute only suppresses alerts; it does not block delivery. Offer session-local hide/mute for guest senders, clearly explaining that reconnecting guests have no durable account identity.
- Reuse text screening after extracting shared code if necessary. Validate Unicode, byte size, character limits, empty text, and control characters on the server. Render text without HTML interpretation.
- Reports reference server-issued message IDs. Verify that a reporter was a recipient/member; do not trust client-supplied evidence text. Snapshot valid evidence when reported.
- Apply account bans across HTTP and WebSocket paths. Add timed chat restrictions with expiry and reasons, plus audited moderator actions.
- Keep private bodies out of `/status`, performance events, console logs, and broad analytics. Moderator access requires explicit privileges and an audit trail.
- Proposed retention: Nearby evidence seven days; Inbox bodies 90 days; report evidence 180 days or a documented case hold; outbox entries removed after successful processing plus a short diagnostic window. Apply matching backup-expiry rules. These defaults require product review before public launch.
- State plainly that private messages are access-controlled and encrypted in transit, not end-to-end encrypted. Explain retention and report-based moderator access in the UI/help text.
- Decide the intended audience and any age-related messaging restrictions before enabling public private messaging. Do not infer the audience from the voxel art style.

## 8. Implementation sequence

Estimates are engineering working days for one developer, including targeted tests and review; not delivery commitments.

| Phase | Work | Estimate | Exit criteria |
| --- | --- | --- | --- |
| 0: Foundation | Freeze behavior contracts; message IDs and capabilities; account-ticket flow; extract shared validation; migrations and feature flags | 2-3 days | Unauthenticated clients cannot claim account identities; older presence clients remain usable |
| 1: Nearby release | Dedicated Chat panel; accepted/failed states; preserve drafts; account limits; moderation/evidence; block/report; keyboard and mobile behavior | 3-5 days | Two clients communicate only in the intended city/radius; rejected sends are visible; bans/blocks work |
| 2: Inbox | Conversations and requests; persistence; API authorization; idempotency; account-targeted outbox; unread state; reconnect synchronization | 5-7 days | Offline recipient receives history later; duplicate retries create one message; nonmembers cannot read messages |
| 3: Business inquiries | Contact-owner button; ownership-safe thread creation; business context and request controls | 1-2 days | New owner gets only new inquiries; previous private history stays with its original participants |
| 4: Launch checks | Retention job; moderation workflow; backup/restore; load and phone tests; metrics and documentation | 2-3 days | Acceptance checks pass and rollback is rehearsed |

Total planning estimate: 13-20 working days. Phase 1 depends on Phase 0. Inbox can ship before business inquiries. Release Nearby first to validate usability without waiting for every Inbox feature.

Potential later work: optional city channel, typing indicators, opt-in read receipts, friends, small groups, and email/push notifications. Add each only after measuring demand and moderation load.

## 9. File-level implementation map

| Existing area | Planned change |
| --- | --- |
| `server/multiplayer.mjs` | Authenticate account bindings; Nearby validation/acks; server-enforced filtering; account-targeted notifications and bounded send queues |
| `lib/net/multiplayer.js` | Messaging capability handling, ticket authentication, transport errors, account reset, and events forwarded to chat state |
| `lib/state/chatStore.js` (new) | Channel buffers, conversation state, drafts, pending sends, unread cursors, deduplication; subscribe independently of simulation state |
| `lib/data/messaging.js` (new) | Typed/validated API operations and reconnect/history synchronization |
| `components/ui/chat/` (new) | Chat panel, Nearby log, Inbox list, Requests, composer, message actions and preferences |
| `components/ui/panel/Toolbar.jsx`, `SidePanel.jsx`, `lib/state/panelStore.js` | Add Chat entry/view and unread badge |
| `components/ui/panel/views.jsx` | Move existing chat out of OnlineView and link to the dedicated panel |
| `components/ui/PlotCard.jsx` | Business-inquiry entry point and sign-in continuation |
| `server/api/messaging.mjs` (new) | Authorization, transactions, conversations, requests, blocks, evidence, read cursors and outbox |
| `server/api/server.mjs`, `schema.sql`, `db.mjs` | Routes, incremental migrations, cleanup/worker integration |
| `server/api/moderation.mjs`, `scripts/moderate.mjs` | Message report targets, evidence access and timed restrictions |
| `tests/` | Protocol, API, migration, browser, security-boundary and load coverage |

Before implementation, read the relevant local Next.js guides under `node_modules/next/dist/docs/` as required by AGENTS.md. This planning document makes no framework/API changes.

## 10. Verification and acceptance

### Protocol and authorization

- Same-city in-range Nearby delivery; no cross-city/out-of-range delivery; sender echo appears once.
- Messages cannot spoof sender account, server ID, room, timestamp, or recipient membership.
- Block, ban, logout, ticket expiry, reconnect, multiple tabs, and account switches enforce the same identity rules.
- Guessing conversation IDs, message IDs, cursors, and report IDs never exposes another account's content.
- Each socket notification is delivered only to authorized account connections across cities and presence nodes.

### Reliability and state

- Offline sends preserve drafts and show failure; rate-limit rejection never looks successful.
- Dropped acceptance responses and retries cannot duplicate persisted messages or first-contact requests.
- Database success followed by notification failure is repaired by the outbox and API synchronization.
- Read cursors are monotonic and unread counts remain correct across tabs/devices, reconnects, and retention cleanup.
- Nearby messages are not replayed after a city change. Private buffers clear on logout/account switch.
- Concurrent business takeover/inquiry creation never transfers historical access.

### Interface and operations

- Keyboard focus prevents avatar movement while typing; IME, Escape, Enter, and screen-reader announcements behave correctly.
- Verify phone keyboard layout on physical devices and ensure chat never covers essential controls.
- Exercise rendering with script-like text, long Unicode input, emoji, repeated characters, and malicious links.
- Test migrations on a populated database, cleanup with report holds, restart recovery, and backup restore.
- Load-test with at least the existing 600-client crowded-presence benchmark and realistic chat activity; compare to the same machine's baseline. Include hostile clients sending at configured limits.
- Proposed targets: p95 server acceptance below 500 ms under the agreed test load, no more than 10% regression in presence tick time, bounded socket queues, and no unrelated client stalls when a recipient is slow.
- Track accepted/rejected sends, API latency, reconnect failures, outbox lag, report backlog, and storage growth without collecting message bodies.

## 11. Release and rollback

Use separate feature flags for Nearby sending, Inbox, business inquiries, and any future city channel. Keep local development defaults separate from public deployment defaults.

Roll out to local two-client testing, then a small authenticated group, then a public Nearby release, then Inbox. Ensure a moderator can handle reports before inviting public users.

Rollback disables messaging writes and real-time fanout while preserving stored conversations and read-only access where safe. Stop notification retries for disabled features without deleting durable events. Avoid destructive schema rollback; deploy backward-compatible migrations and restore backups only through a tested recovery procedure.

Update `docs/README.md`, `docs/roadmap/tasks.md`, `server/README.md`, and backend documentation when implementation ships. Correct the Online panel's outdated wording about what is shared at the same time.

## 12. Decisions to confirm during implementation

1. Confirm sign-in-required public sending, Nearby-first rollout, and whether a city channel is wanted at all.
2. Confirm message-request defaults, recipient limits, retention periods, intended audience, and moderation ownership.
3. Confirm whether business inquiries are person-to-person threads as recommended or a future multi-staff business inbox. The latter needs a separate membership/audit design.
4. Confirm whether to keep the initial 140-character Nearby limit or expand it after usability testing.

These decisions should be settled before their dependent public rollout. The architecture, local UI prototype, and authenticated Nearby foundation can proceed using the proposed defaults.
