"""The messaging service's HTTP side: the same routes, bodies and error shapes as the Node API's messaging routes, so the game and the
presence server talk to it unchanged (through the Node API, which forwards them, or straight through the proxy).

    python -m app            (from services/messaging, with its .venv; see services/messaging/README.md)
"""
from __future__ import annotations

import asyncio
import json
import re
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import Settings
from .db import open_db
from .domain import Messaging, now
from .errors import Fail
from .node import Node

CONVERSATION_ID = re.compile(r'[\w-]{6,40}', re.ASCII)


def _account_id(v) -> int:
    if isinstance(v, int) and not isinstance(v, bool) and v > 0:
        return v
    raise Fail(400, 'Send the account number.', 'bad_request')


def create_app(cfg: Settings | None = None, node: Node | None = None) -> FastAPI:
    cfg = cfg or Settings()
    db = open_db(cfg.db)
    node = node or Node(cfg)
    m = Messaging(db, cfg, node)
    hits: dict[str, list[int]] = {}  # address -> [window start, requests]

    async def jobs():
        last_prune = 0.0
        while True:
            await asyncio.sleep(2)
            try:
                await m.deliver_notices()
                m.forget_quiet_budgets()
                if time.time() - last_prune > 3600:
                    last_prune = time.time()
                    m.prune()
            except Exception as e:  # the next round tries again
                print('messaging job failed:', type(e).__name__, e)

    @asynccontextmanager
    async def lifespan(_app):
        task = asyncio.create_task(jobs()) if cfg.jobs else None
        yield
        if task:
            task.cancel()
        await node.close()
        db.close()

    app = FastAPI(title='VoxelVenture messaging', lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.messaging = m
    app.add_middleware(CORSMiddleware, allow_origins=[cfg.origin] if cfg.origin != '*' else ['*'], allow_methods=['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], allow_headers=['Content-Type', 'Authorization'])

    def forwarded(request: Request) -> bool:
        """Came through the Node API's forwarding (or from the presence server): it carries the internal credential."""
        return bool(cfg.internal_secret) and request.headers.get('x-internal-secret') == cfg.internal_secret

    @app.middleware('http')
    async def guard(request: Request, call_next):
        # the Node API already limits what it forwards; a caller straight through the proxy is limited here, by address
        if not forwarded(request) and request.method != 'OPTIONS':
            ip = (request.headers.get('x-forwarded-for', '').split(',')[0].strip() if cfg.trust_proxy else '') or (request.client.host if request.client else '?')
            t = now()
            h = hits.get(ip)
            if not h or t - h[0] > 60000:
                h = hits[ip] = [t, 0]
            h[1] += 1
            if len(hits) > 50000:
                hits.clear()
            if h[1] > cfg.per_minute:
                return JSONResponse({'error': 'Slow down.', 'code': 'rate_limited'}, 429, headers={'Cache-Control': 'no-store'})
        if cfg.read_only and request.method not in ('GET', 'OPTIONS', 'HEAD') and not request.url.path.startswith('/admin/'):
            return JSONResponse({'error': 'Messages are read-only for a few minutes while we do maintenance.', 'code': 'unavailable'}, 503, headers={'Cache-Control': 'no-store'})
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        return response

    @app.exception_handler(Fail)
    async def failed(_req, e: Fail):
        return JSONResponse(e.body(), e.status)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_req, e):
        return JSONResponse({'error': 'Not found.', 'code': 'not_found'} if e.status_code in (404, 405) else {'error': str(e.detail), 'code': 'error'}, 404 if e.status_code in (404, 405) else e.status_code)

    @app.exception_handler(Exception)
    async def crashed(_req, e):
        print('messaging error:', type(e).__name__, e)
        return JSONResponse({'error': 'Something went wrong.', 'code': 'server_error'}, 500)

    async def body(request: Request) -> dict:
        raw = await request.body()
        if len(raw) > 150_000:
            raise Fail(413, 'That is too large.', 'too_large')
        if not raw:
            return {}
        try:
            data = json.loads(raw)
        except ValueError:
            raise Fail(400, 'The body is not valid JSON.', 'bad_json')
        return data if isinstance(data, dict) else {}

    async def who(request: Request):
        """The signed-in account, checked with the Node API on every request (so signing out and bans apply at once)."""
        auth = request.headers.get('authorization', '')
        token = auth[7:] if auth[:7].lower() == 'bearer ' else ''
        account = await node.session(token)
        if account:
            m.remember([account])
        return account

    def conversation(cid: str) -> str:
        if not CONVERSATION_ID.fullmatch(cid):
            raise Fail(404, 'Not found.', 'not_found')
        return cid

    def internal_only(request: Request):
        if not forwarded(request):
            raise Fail(403, 'Not allowed.', 'forbidden')

    def admin_only(request: Request):
        auth = request.headers.get('authorization', '')
        if not cfg.admin_token or auth[7:] != cfg.admin_token:
            raise Fail(403, 'Not allowed.', 'forbidden')

    @app.get('/health')
    async def health():
        return {'ok': True, 'now': now(), 'service': 'messaging', 'outbox': m.outbox_counts()}

    # the presence server (directly, or forwarded by the Node API)
    @app.post('/internal/messaging/nearby')
    async def nearby(request: Request):
        internal_only(request)
        return await m.accept_nearby(await body(request))

    # the Node API's privacy routes (services/api/privacy.mjs): an account's export and its deletion, only with INTERNAL_SECRET
    @app.post('/internal/privacy/export')
    async def privacy_export(request: Request):
        internal_only(request)
        account_id = _account_id((await body(request)).get('accountId'))
        return m.export_for(account_id)

    @app.post('/internal/privacy/erase')
    async def privacy_erase(request: Request):
        internal_only(request)
        b = await body(request)
        username = b.get('username') if isinstance(b.get('username'), str) and b.get('username') else None
        if not username:
            raise Fail(400, 'Send the new name.', 'bad_request')
        return m.erase_for(_account_id(b.get('accountId')), username[:40])

    @app.get('/messaging/summary')
    async def summary(request: Request):
        return m.summary(await who(request))

    @app.get('/messaging/settings')
    async def get_settings(request: Request):
        return m.get_settings(await who(request))

    @app.patch('/messaging/settings')
    async def set_settings(request: Request):
        return m.set_settings(await who(request), await body(request))

    @app.post('/messaging/blocks')
    async def block(request: Request):
        return await m.block(await who(request), await body(request))

    @app.delete('/messaging/blocks/{account_id}')
    async def unblock(request: Request, account_id: str):
        if not account_id.isdigit():
            raise Fail(404, 'Not found.', 'not_found')
        return m.unblock(await who(request), account_id)

    @app.post('/messaging/reports')
    async def report(request: Request):
        return m.report_message(await who(request), await body(request))

    @app.get('/conversations')
    async def conversations(request: Request):
        q = request.query_params
        return m.list_conversations(await who(request), q.get('box', 'inbox'), q.get('cursor'), q.get('limit'))

    @app.post('/conversations')
    async def start(request: Request):
        return await m.start_direct(await who(request), await body(request))

    @app.get('/conversations/{cid}')
    async def get_conversation(request: Request, cid: str):
        return m.get_conversation(await who(request), conversation(cid))

    @app.get('/conversations/{cid}/messages')
    async def messages(request: Request, cid: str):
        q = request.query_params
        return m.list_messages(await who(request), conversation(cid), q.get('before'), q.get('after'), q.get('limit'))

    @app.post('/conversations/{cid}/messages')
    async def send(request: Request, cid: str):
        return await m.send_message(await who(request), conversation(cid), await body(request))

    @app.post('/conversations/{cid}/request')
    async def respond(request: Request, cid: str):
        return m.respond(await who(request), conversation(cid), (await body(request)).get('action'))

    @app.post('/conversations/{cid}/read')
    async def read(request: Request, cid: str):
        return m.mark_read(await who(request), conversation(cid), (await body(request)).get('upTo'))

    @app.patch('/conversations/{cid}/preferences')
    async def preferences(request: Request, cid: str):
        return m.set_preferences(await who(request), conversation(cid), await body(request))

    @app.post('/plots/{plot_id}/inquiries')
    async def inquiry(request: Request, plot_id: str):
        if not plot_id.isdigit():
            raise Fail(404, 'Not found.', 'not_found')
        return await m.start_inquiry(await who(request), plot_id, await body(request))

    # moderators (ADMIN_TOKEN): the same shapes as the Node API's /admin/reports, for chat messages
    @app.get('/admin/reports')
    async def admin_queue(request: Request):
        admin_only(request)
        return {'reports': await m.queue(request.query_params.get('status', 'open'))}

    @app.get('/admin/reports/ids')
    async def admin_report_id(request: Request):
        admin_only(request)
        q = request.query_params
        return {'id': m.first_report_id(q.get('kind'), q.get('id'))}

    @app.post('/admin/reports/{report_id}/resolve')
    async def admin_resolve(request: Request, report_id: str):
        admin_only(request)
        return await m.resolve(report_id, (await body(request)).get('action'))

    @app.post('/admin/messaging/prune')
    async def admin_prune(request: Request):
        admin_only(request)
        at = (await body(request)).get('at')
        return m.prune(int(at) if isinstance(at, (int, float)) else None)

    @app.post('/admin/messaging/deliver')
    async def admin_deliver(request: Request):
        admin_only(request)
        return {**(await m.deliver_notices()), 'outbox': m.outbox_counts()}

    return app
