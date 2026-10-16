"""The one error type: it becomes { error, code, retryAfterMs? } with its status, the same shape the Node API answers with."""
from __future__ import annotations


class Fail(Exception):
    def __init__(self, status: int, message: str, code: str, retry_after_ms: float | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.code = code
        self.retry_after_ms = retry_after_ms

    def body(self) -> dict:
        out = {'error': self.message, 'code': self.code}
        if self.retry_after_ms:
            out['retryAfterMs'] = int(-(-self.retry_after_ms // 1))  # rounded up, like Math.ceil
        return out
