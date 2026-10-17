"""The Python text checks must answer exactly like services/api/textcheck.mjs: both are run on the same awkward inputs."""
import json
import shutil
import subprocess
import unittest
from pathlib import Path

from app.textcheck import check_text, clean_message

ROOT = Path(__file__).resolve().parents[3]
CASES = [
    'Hello neighbours!', '   ', '', 'cheap v1agra here', 'V.I.A.G.R.A', 'see http://a.test', 'see http://a.test and www.b.test',
    'aaaaaaaaaaaa', 'a' * 9, '😀' * 12, 'ÀÀÀÀÀÀÀÀÀÀÀ', 'THIS IS ALL SHOUTING NOW', 'Mostly LOWER case words here',
    'tab\there', 'line\nbreak', 'win\r\ndows\rold mac', 'a b c', 'zero​width', 'nbsp space', 'bom﻿here',
    '　ideographic　', 'ctrl\x07bell\x1fend', 'c1\x85\x9fend', 'many\n\n\n\n\n\nlines', 'trailing   \nspaces', 'x' * 1200,
    'emoji 👍🏽 and 👨‍👩‍👧', 'İstanbul ß ẞ', 'send nudes', 's e n d   n u d e s', 'replacement � char', '  padded  ',
]


@unittest.skipUnless(shutil.which('node'), 'node is not on PATH')
class TextCheckParity(unittest.TestCase):
    def test_same_answers_as_javascript(self):
        script = (
            "const { checkText, cleanMessage } = await import(process.argv[1]);"
            "const cases = JSON.parse(require('fs').readFileSync(0, 'utf8'));"
            "process.stdout.write(JSON.stringify(cases.map((c) => [checkText(c, { links: 0 }), checkText(c, { links: 1 }), cleanMessage(c, 140), cleanMessage(c, 1000, { lines: true })])));"
        )
        module = (ROOT / 'services' / 'api' / 'textcheck.mjs').as_uri()
        out = subprocess.run(['node', '--input-type=commonjs', '-e', f'(async () => {{ {script} }})()', module], input=json.dumps(CASES), capture_output=True, text=True, encoding='utf-8', check=True)
        js = json.loads(out.stdout)
        for case, (zero, one, short, long) in zip(CASES, js):
            with self.subTest(case=case[:30]):
                self.assertEqual(check_text(case, links=0), (zero['ok'], zero.get('reason', '')))
                self.assertEqual(check_text(case, links=1), (one['ok'], one.get('reason', '')))
                self.assertEqual(clean_message(case, 140), short)
                self.assertEqual(clean_message(case, 1000, lines=True), long)


if __name__ == '__main__':
    unittest.main()
