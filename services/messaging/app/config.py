"""Settings, all from the environment (the same MESSAGING_* names the Node API reads, so one api.env describes both)."""
from __future__ import annotations

import os
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent


class Settings:
    def __init__(self, env: dict | None = None):
        e = os.environ if env is None else env

        def num(name: str, default: float) -> float:
            try:
                v = float(e.get(name, ''))
                return v if v > 0 else default
            except ValueError:
                return default

        self.port = int(num('MESSAGING_PORT', 3003))
        self.host = e.get('MESSAGING_HOST', '127.0.0.1')
        self.db = e.get('MESSAGING_DB', str(HERE / 'data' / 'messaging.db'))  # or :memory:
        self.node_url = e.get('NODE_API_URL', 'http://127.0.0.1:3002').rstrip('/')  # accounts, sessions, plots
        self.internal_secret = e.get('INTERNAL_SECRET', '')  # this service <-> the Node API (and the presence server's nearby calls)
        self.notify_url = e.get('MP_NOTIFY_URL', '')  # the presence server's /notify (account notices go to /notify-accounts beside it)
        self.notify_secret = e.get('MP_NOTIFY_SECRET', '')
        self.admin_token = e.get('ADMIN_TOKEN', '')
        self.origin = e.get('API_ORIGIN', '*')
        self.trust_proxy = bool(e.get('TRUST_PROXY'))
        self.nearby = e.get('MESSAGING_NEARBY') != '0'
        self.inbox = e.get('MESSAGING_INBOX') != '0'
        self.inquiries = e.get('MESSAGING_INQUIRIES') != '0'
        self.sends_per_minute = int(num('MESSAGING_SENDS_PER_MINUTE', 20))
        self.new_per_day = int(num('MESSAGING_NEW_PER_DAY', 5))
        self.nearby_per_minute = int(num('MESSAGING_NEARBY_PER_MINUTE', 20))
        self.nearby_days = num('MESSAGING_NEARBY_DAYS', 7)
        self.inbox_days = num('MESSAGING_INBOX_DAYS', 90)
        self.report_days = num('MESSAGING_REPORT_DAYS', 180)
        self.words_file = e.get('MODERATION_WORDS_FILE', '')
        self.moderation_url = e.get('MODERATION_WEBHOOK_URL', '')
        self.moderation_token = e.get('MODERATION_WEBHOOK_TOKEN', '')
        self.read_only = e.get('MESSAGING_READONLY') == '1'  # a pause for moving messages: everything can be read, nothing written
        self.jobs = e.get('MESSAGING_JOBS') != '0'  # 0: no background notices or pruning (tests drive them by hand)
        self.per_minute = int(num('MESSAGING_RATE_PER_MINUTE', 240))  # requests a minute from one address not forwarded by the Node API
