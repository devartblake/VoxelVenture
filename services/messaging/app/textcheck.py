"""The first filter on what players write: a port of server/api/textcheck.mjs that gives the same answers.

JavaScript and Python disagree on small things (which characters are white space, what "." matches, emoji as two UTF-16 units),
so those are spelled out here to match the JavaScript; tests/test_textcheck.py runs both on the same inputs.
"""
from __future__ import annotations

import os
import re

STARTER = ['viagra', 'casino bonus', 'free crypto', 'crypto giveaway', 'click here to win', 'porn', 'xxx', 'nude', 'kill yourself', 'send nudes', 'whatsapp me', 'telegram me']

# JavaScript's \s, and the characters String.prototype.trim removes (the same set)
JS_SPACE = '\t\n\v\f\r    -     　﻿'
_space_run = re.compile(f'[{JS_SPACE}]+')
_strip_chars = '\t\n\v\f\r                  　﻿'
_links = re.compile(r'https?://|www\.', re.IGNORECASE)
# JavaScript's /(.)\1{9,}/ without the u flag: "." is one UTF-16 unit and not a line end, so a run of the same emoji never matches
_repeat = re.compile('([^\n\r  \U00010000-\U0010ffff])\\1{9,}')
_leet = str.maketrans({'0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '$': 's', '@': 'a', '!': 'i', '|': 'l'})
_not_word = re.compile('[^a-z0-9 ]')


def js_trim(t: str) -> str:
    return t.strip(_strip_chars)


def word_list(words_file: str | None = None) -> list[str]:
    path = words_file if words_file is not None else os.environ.get('MODERATION_WORDS_FILE', '')
    extra: list[str] = []
    if path and os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            extra = [line.strip().lower() for line in f.read().splitlines() if line.strip()]
    return STARTER + extra


def _normalise(t: str) -> str:
    return _not_word.sub('', t.lower().translate(_leet))  # "v1agra", "v.i.a.g.r.a" and "VIAGRA" all read as "viagra"


def _squash(t: str) -> str:
    return _space_run.sub('', _normalise(t))


def check_text(value, links: int = 1, words: list[str] | None = None) -> tuple[bool, str]:
    """(True, '') or (False, the reason). `links` is how many web links the text may contain."""
    t = '' if value is None else str(value)
    if not js_trim(t):
        return True, ''
    flat = _squash(t)
    for w in words if words is not None else word_list():
        if _space_run.sub('', w) in flat:
            return False, 'That text is not allowed here.'
    if len(_links.findall(t)) > links:
        return False, f"Please keep it to {'no links' if links == 0 else 'one link' if links == 1 else f'{links} links'}."
    if _repeat.search(t):
        return False, 'Please do not repeat one character like that.'
    letters = re.sub('[^A-Za-z]', '', t)
    if len(letters) >= 12 and len(re.sub('[^A-Z]', '', letters)) / len(letters) > 0.8:
        return False, 'Please do not write everything in capitals.'
    return True, ''


def _keep(c: str, lines: bool) -> bool:
    n = ord(c)
    return (lines and n == 10) or (n >= 32 and n != 127 and not (0x80 <= n < 0xA0) and n not in (0x2028, 0x2029))


def clean_message(value, max_len: int, lines: bool = False) -> str:
    """A chat line or private message as plain text: valid Unicode only, no control characters except line breaks when `lines` is
    set (\\r\\n becomes \\n, at most two blank lines in a row), trimmed, at most `max_len` characters (code points). '' for nothing left."""
    if not isinstance(value, str):
        return ''
    # a lone surrogate (only possible from JSON escapes) is dropped, like JavaScript's toWellFormed() and then the U+FFFD removal
    t = ''.join(c for c in value if not (0xD800 <= ord(c) <= 0xDFFF) and c != '�')
    t = t.replace('\r\n', '\n').replace('\r', '\n')
    t = ''.join(c for c in t if _keep(c, lines))
    if not lines:
        t = _space_run.sub(' ', t)
    else:
        t = re.sub('[ \t]+\n', '\n', t)
        t = re.sub('\n{4,}', '\n\n\n', t)
    return js_trim(js_trim(t)[:max_len])
