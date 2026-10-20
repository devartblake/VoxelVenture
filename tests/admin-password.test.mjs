// The admin password rule (lib/data/adminPassword.js), shared by the API and the admin pages: strong enough without being long.
import { imp } from './helpers.mjs';
const { passwordProblem, PASSWORD_MIN, PASSPHRASE_MIN } = await imp('data/adminPassword.js');

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok  ' : 'FAIL', name, extra); };
const fine = (pw, user = 'owner') => passwordProblem(user, pw) === '';

check('8 characters with 3 kinds is enough', PASSWORD_MIN === 8 && fine('Vox3lHq!') && fine('vox3lhq!') && fine('VOX3LHQ!') && fine('Voxelhq7'));
check('7 is too few, whatever is in it', !fine('Vx3l!q7'));
check('8 with only 2 kinds is refused', !fine('voxelhq7') && !fine('VOXELHQ!') && !fine('voxel hq'));
check(`a phrase of ${PASSPHRASE_MIN}+ characters needs no mix`, PASSPHRASE_MIN === 16 && fine('three random words') && !fine('two words here'));
check('the username is refused, in any case', !fine('Owner123!', 'owner123!') && !fine('OWNERowner1', 'ownerowner1'));
check('common passwords are refused', !fine('Password123') && !fine('P@ssw0rd') && !fine('Admin123'));
check('every refusal says why, in a sentence', [passwordProblem('a', 'x'), passwordProblem('a', 'abcdefgh'), passwordProblem('a', 'Password1')].every((m) => /\.$/.test(m) && m.length > 20));
check('200 characters at most', !fine(`Aa1!${'x'.repeat(200)}`));

console.log(fails ? `\n${fails} check(s) failed` : '\nall admin password checks passed');
process.exit(fails ? 1 : 0);
