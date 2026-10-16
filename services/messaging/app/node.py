"""Calls to the Node side: the API (the authority on accounts, sign-ins, bans and who owns a plot) and the presence server (it
passes "your inbox changed" to one account's connections). Every call has a short timeout; when the API cannot be reached the
caller gets an explicit "unavailable", never a guess."""
from __future__ import annotations

import httpx

from .errors import Fail


class Unreachable(Fail):
    def __init__(self):
        super().__init__(503, 'The account server cannot be reached. Try again in a moment.', 'unavailable')


class Node:
    def __init__(self, cfg, client: httpx.AsyncClient | None = None):
        self.cfg = cfg
        self.http = client or httpx.AsyncClient(timeout=4.0)

    async def _post(self, path: str, body: dict):
        try:
            res = await self.http.post(self.cfg.node_url + path, json=body, headers={'X-Internal-Secret': self.cfg.internal_secret})
        except httpx.HTTPError:
            raise Unreachable()
        return res

    async def session(self, token: str) -> dict | None:
        """The account a bearer token belongs to (signed in, not banned), or None. The token is only ever sent in a body."""
        if not token:
            return None
        res = await self._post('/internal/identity/session', {'token': token})
        if res.status_code == 401:
            return None
        if res.status_code != 200:
            raise Unreachable()
        return res.json()['account']

    async def binding(self, binding: str) -> dict | None:
        """The account behind a presence connection's sign-in, or None once it has ended."""
        res = await self._post('/internal/identity/binding', {'binding': str(binding or '')})
        if res.status_code == 401:
            return None
        if res.status_code != 200:
            raise Unreachable()
        return res.json()['account']

    async def accounts(self, ids=(), username: str | None = None) -> list[dict]:
        res = await self._post('/internal/identity/accounts', {'ids': list(ids), **({'username': username} if username else {})})
        if res.status_code != 200:
            raise Unreachable()
        return res.json()['accounts']

    async def owner(self, plot_id) -> dict:
        """{ plotId, title, ownerAccount, version }: version changes whenever the plot changes hands."""
        try:
            res = await self.http.get(f'{self.cfg.node_url}/internal/plots/{int(plot_id)}/owner', headers={'X-Internal-Secret': self.cfg.internal_secret})
        except httpx.HTTPError:
            raise Unreachable()
        if res.status_code == 404:
            data = res.json()
            raise Fail(404, data.get('error', 'No such plot.'), data.get('code', 'not_found'))
        if res.status_code != 200:
            raise Unreachable()
        return res.json()

    async def ban(self, account_id: int, reason: str) -> None:
        res = await self._post(f'/internal/identity/accounts/{int(account_id)}/ban', {'reason': reason})
        if res.status_code != 200:
            raise Unreachable()

    async def notify(self, events: list[dict]) -> bool:
        """Hands account notices to the presence server. True if it took them."""
        if not self.cfg.notify_url:
            return False
        url = self.cfg.notify_url.rstrip('/')
        url = url[: -len('/notify')] if url.endswith('/notify') else url
        try:
            res = await self.http.post(url + '/notify-accounts', json={'events': events}, headers={'X-Notify-Secret': self.cfg.notify_secret})
            return res.status_code == 200
        except httpx.HTTPError:
            return False

    async def screen(self, text: str) -> None:
        """The optional outside moderation service (MODERATION_WEBHOOK_URL), as the Node API uses it: unreachable means allowed."""
        if not self.cfg.moderation_url:
            return
        verdict = {'allowed': True}
        try:
            headers = {'Authorization': f'Bearer {self.cfg.moderation_token}'} if self.cfg.moderation_token else {}
            res = await self.http.post(self.cfg.moderation_url, json={'kind': 'text', 'text': text}, headers=headers)
            if res.status_code < 300:
                verdict = res.json()
        except (httpx.HTTPError, ValueError):
            pass
        if verdict.get('allowed') is False:
            raise Fail(422, verdict.get('reason') or 'That text is not allowed here.', 'content_rejected')

    async def close(self):
        await self.http.aclose()
