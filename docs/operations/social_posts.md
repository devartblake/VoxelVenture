# Welcome posts on X

Status: **built, off by default (2026-10-16).** This is idea 02, section 5 ("Automated co-marketing and platform syndication"), reviewed in [ideas_review.md](../roadmap/ideas_review.md).

When a business joins, VoxelVenture's own X account can post a welcome that tags the owner and links to their page:

> Welcome Maya Bakery to VoxelVenture's Creator Commons! @mayabakes Step inside: https://voxelventure.example/business/maya-bakery?utm_source=x&utm_medium=social&utm_campaign=welcome

## Who gets posted about

- **Only owners who opt in.** The profile form has an optional "Your X handle" field and a box: "Welcome my business on VoxelVenture's X account and tag my handle". Nothing is posted without that box ticked, and the box can't be ticked without a handle.
- **What triggers a post.** A new profile from an owner who opted in. A building claimed in the 3D city by an owner who opted in on one of their profiles; that post links to `/b/<plot>`.
- **Once each.** Every business or building is welcomed at most once.
- **The text is safe to post.**
  - The business name has already passed the same word filter as everything else players write.
  - `@` and `#` are removed from the name, so a name cannot tag or hashtag anyone.
  - The handle must be a valid X handle.
  - Long names are shortened to keep the post within 280 characters (X counts each link as 23).

## Tracking what a post brought

- **Visits from the post.** The link carries `utm_source=x`, so those visits count under their own source, "VoxelVenture on X", in the owner's figures on My profiles. They are kept apart from other social traffic, and verified like every other visit.
- **The post itself.** The owner sees the post's state (waiting for a check, posted or not posted) and a link to it once it is live.
- **Your record.** Every approval and rejection is in the audit trail (`social.approve`, `social.reject`).

## Turning it on

In the API's settings (`api.env`):

| Setting | Meaning |
| --- | --- |
| `SOCIAL_POSTS` | `off` (the default: nothing is queued), `review` (an admin approves each post first; **recommended to start**) or `auto` (posted as they come) |
| `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` | The X account's OAuth 1.0a keys: a developer app on the account with **read and write** permission. The access token must belong to the posting account. |
| `PUBLIC_SITE_URL` | The site's https:// address, used for the links. |
| `SOCIAL_MAX_PER_DAY` | At most this many posts in 24 hours (default 20); the rest wait their turn. Keep it within your X API plan's posting limit. |

With `SOCIAL_POSTS` on, the API refuses to start in production without the keys and the site address (`npm run check:env` says so too).

**Reviewing** (admin token):

- `GET /admin/social` lists the posts waiting, with their exact text.
- `POST /admin/social/<id>/approve` sends a post; `/reject` drops it.
- `?status=posted|failed|queued` lists the posts in another state.

**Sending.** The API sends due posts once a minute, and at once when one is queued or approved. X's rate limit is respected: a post waits until the limit resets.

**Errors.**

- A temporary error is retried after 1, 4, 16 and 64 minutes, then given up.
- A refusal (400 or 403, e.g. duplicate text or no write permission) is given up at once, with X's reason kept in the error.
- A business taken down by moderation before its turn is skipped.

## Not done

- **A picture of the building in the post.** The profile link already shows its generated share card, from `opengraph-image.jsx`, when X fetches it. A screenshot of the 3D building would need a headless rendering worker.
- **LinkedIn.**
- **Milestone posts**, e.g. "Building of the Week".
- **Rewards for reposts.**

## Tests

`tests/social.test.mjs` runs against a stand-in for the X API that checks every request's OAuth 1.0a signature. It covers:

- the text rules and the length limit;
- that nothing is queued when posting is off;
- consent;
- the review queue (approve, reject, and no deciding twice);
- the owner's view of the post;
- building claims;
- the "x" source in the figures;
- retries;
- the daily cap;
- skipping a business taken down by moderation;
- giving up on a 403.
